//! Private portable boundary for OpenAI's bounded transcription endpoint.
//!
//! The adapter owns the fixed provider endpoint, wire contract, credentials,
//! cancellation, and diagnostics. No provider type is exposed to Cuttledoc's
//! public API.

use std::error::Error;
use std::fmt;
use std::fs::File;
use std::io::Read;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::time::Duration;

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::header::{AUTHORIZATION, CONTENT_TYPE, HeaderValue};
use hyper::{Method, Request, StatusCode, Uri};
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use serde_json::Value;
use tokio::runtime::{Builder, Runtime};

pub const BACKEND_ID: &str = "openai-transcription";
pub const API_KEY_ENV: &str = "OPENAI_API_KEY";
pub const ENDPOINT: &str = "https://api.openai.com/v1/audio/transcriptions";
pub const DEFAULT_MODEL_ID: &str = "gpt-4o-transcribe";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(300);
pub const MAXIMUM_UPLOAD_BYTES: u64 = 25_000_000;
pub const SUPPORTED_MODEL_IDS: &[&str] =
    &["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"];

const MAXIMUM_RESPONSE_BYTES: usize = 64 * 1024;
const READ_CHUNK_BYTES: usize = 64 * 1024;
const CANCELLATION_POLL_INTERVAL: Duration = Duration::from_millis(10);
const MULTIPART_BOUNDARY_PREFIX: &str = "----cuttledoc-openai-v1-";

type Connector = HttpsConnector<HttpConnector>;
type HttpClient = Client<Connector, Full<Bytes>>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterErrorKind {
    CredentialsMissing,
    InvalidInput,
    AuthenticationFailed,
    RateLimited,
    TimedOut,
    TransportFailed,
    ResponseInvalid,
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdapterError {
    pub kind: AdapterErrorKind,
    pub message: String,
}

impl AdapterError {
    fn new(kind: AdapterErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for AdapterError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl Error for AdapterError {}

#[derive(Clone, Eq, PartialEq)]
pub struct Credential(String);

impl Credential {
    pub fn new(value: String) -> Result<Self, AdapterError> {
        if value.trim().is_empty() || value.trim() != value || value.chars().any(char::is_control) {
            return Err(AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                "OpenAI API key is missing or invalid",
            ));
        }
        Ok(Self(value))
    }

    pub fn from_environment() -> Result<Self, AdapterError> {
        let value = std::env::var(API_KEY_ENV).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                format!("OpenAI requires {API_KEY_ENV} or an in-memory credential"),
            )
        })?;
        Self::new(value)
    }
}

impl fmt::Debug for Credential {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Credential([REDACTED])")
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptionRequest {
    pub model: String,
    pub language: Option<String>,
}

impl Default for TranscriptionRequest {
    fn default() -> Self {
        Self {
            model: DEFAULT_MODEL_ID.to_owned(),
            language: None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptionSegment {
    pub start: Duration,
    pub end: Duration,
    pub text: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub duration: Option<Duration>,
    pub segments: Vec<TranscriptionSegment>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineOptions {
    pub credential: Credential,
    pub timeout: Duration,
}

pub struct OpenAiTranscriptionEngine {
    credential: Credential,
    timeout: Duration,
    endpoint: Uri,
    runtime: Runtime,
    client: HttpClient,
}

impl OpenAiTranscriptionEngine {
    pub fn create(options: EngineOptions) -> Result<Self, AdapterError> {
        Self::create_for_endpoint(options, ENDPOINT)
    }

    fn create_for_endpoint(options: EngineOptions, endpoint: &str) -> Result<Self, AdapterError> {
        if options.timeout.is_zero() {
            return Err(AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "OpenAI timeout must be greater than zero",
            ));
        }
        let endpoint = endpoint.parse::<Uri>().map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::TransportFailed,
                "OpenAI endpoint configuration is invalid",
            )
        })?;
        if endpoint
            .scheme_str()
            .is_none_or(|scheme| scheme != "https" && !(cfg!(test) && scheme == "http"))
        {
            return Err(AdapterError::new(
                AdapterErrorKind::TransportFailed,
                "OpenAI endpoint configuration is invalid",
            ));
        }
        let runtime = Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::TransportFailed,
                    "OpenAI HTTP runtime could not be created",
                )
            })?;
        let client = http_client()?;
        Ok(Self {
            credential: options.credential,
            timeout: options.timeout,
            endpoint,
            runtime,
            client,
        })
    }

    pub fn validate_file(path: impl AsRef<Path>) -> Result<(), AdapterError> {
        let path = path.as_ref();
        supported_file_type(path)?;
        let metadata = File::open(path)
            .and_then(|file| file.metadata())
            .map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::InvalidInput,
                    "OpenAI transcription input could not be read",
                )
            })?;
        if metadata.len() > MAXIMUM_UPLOAD_BYTES {
            return Err(upload_too_large());
        }
        if metadata.len() == 0 {
            return Err(AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "OpenAI transcription input must not be empty",
            ));
        }
        Ok(())
    }

    pub fn transcribe_file(
        &self,
        path: impl AsRef<Path>,
        request: &TranscriptionRequest,
        is_cancelled: impl Fn() -> bool,
    ) -> Result<TranscriptionResult, AdapterError> {
        if cancellation_requested(&is_cancelled) {
            return Err(cancelled());
        }
        let model = Model::parse(&request.model)?;
        let language = normalized_language(request.language.as_deref())?;
        let input = read_input(path.as_ref(), &is_cancelled)?;
        let multipart = multipart_body(&input, model, language.as_deref());
        let request = self.http_request(multipart)?;
        let operation = execute_request(&self.client, request, model, language);

        self.runtime.block_on(async {
            tokio::select! {
                biased;
                () = wait_for_cancellation(&is_cancelled) => Err(cancelled()),
                result = tokio::time::timeout(self.timeout, operation) => {
                    match result {
                        Ok(result) => result,
                        Err(_) => Err(AdapterError::new(
                            AdapterErrorKind::TimedOut,
                            "OpenAI transcription request timed out",
                        )),
                    }
                }
            }
        })
    }

    fn http_request(&self, multipart: MultipartBody) -> Result<Request<Full<Bytes>>, AdapterError> {
        let authorization = HeaderValue::from_str(&format!("Bearer {}", self.credential.0))
            .map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::CredentialsMissing,
                    "OpenAI API key is missing or invalid",
                )
            })?;
        Request::builder()
            .method(Method::POST)
            .uri(self.endpoint.clone())
            .header(AUTHORIZATION, authorization)
            .header(
                CONTENT_TYPE,
                format!("multipart/form-data; boundary={}", multipart.boundary),
            )
            .body(Full::new(Bytes::from(multipart.body)))
            .map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::TransportFailed,
                    "OpenAI transcription request could not be constructed",
                )
            })
    }
}

fn http_client() -> Result<HttpClient, AdapterError> {
    let connector = HttpsConnectorBuilder::new()
        .with_native_roots()
        .map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::TransportFailed,
                "OpenAI TLS certificate roots could not be loaded",
            )
        })?
        .https_or_http()
        .enable_http1()
        .build();
    Ok(Client::builder(TokioExecutor::new()).build(connector))
}

async fn execute_request(
    client: &HttpClient,
    request: Request<Full<Bytes>>,
    model: Model,
    requested_language: Option<String>,
) -> Result<TranscriptionResult, AdapterError> {
    let response = client.request(request).await.map_err(|_| {
        AdapterError::new(
            AdapterErrorKind::TransportFailed,
            "OpenAI transcription transport failed",
        )
    })?;
    let status = response.status();
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            return Err(AdapterError::new(
                AdapterErrorKind::AuthenticationFailed,
                "OpenAI rejected the configured credential",
            ));
        }
        StatusCode::TOO_MANY_REQUESTS => {
            return Err(AdapterError::new(
                AdapterErrorKind::RateLimited,
                "OpenAI transcription rate limit was reached",
            ));
        }
        _ if !status.is_success() => {
            return Err(AdapterError::new(
                AdapterErrorKind::TransportFailed,
                format!(
                    "OpenAI transcription request failed with HTTP {}",
                    status.as_u16()
                ),
            ));
        }
        _ => {}
    }

    let body = read_response_body(response.into_body()).await?;
    parse_response(&body, model, requested_language)
}

async fn read_response_body(mut body: hyper::body::Incoming) -> Result<Vec<u8>, AdapterError> {
    let mut collected = Vec::new();
    while let Some(frame) = body.frame().await {
        let frame = frame.map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::TransportFailed,
                "OpenAI transcription response could not be read",
            )
        })?;
        let Ok(data) = frame.into_data() else {
            continue;
        };
        if collected.len().saturating_add(data.len()) > MAXIMUM_RESPONSE_BYTES {
            return Err(AdapterError::new(
                AdapterErrorKind::ResponseInvalid,
                "OpenAI transcription response exceeded the size limit",
            ));
        }
        collected.extend_from_slice(&data);
    }
    Ok(collected)
}

async fn wait_for_cancellation(is_cancelled: &dyn Fn() -> bool) {
    loop {
        if cancellation_requested(is_cancelled) {
            return;
        }
        tokio::time::sleep(CANCELLATION_POLL_INTERVAL).await;
    }
}

fn cancellation_requested(is_cancelled: &dyn Fn() -> bool) -> bool {
    catch_unwind(AssertUnwindSafe(is_cancelled)).unwrap_or(true)
}

fn read_input(path: &Path, is_cancelled: &dyn Fn() -> bool) -> Result<AudioInput, AdapterError> {
    let (extension, content_type) = supported_file_type(path)?;
    let mut file = File::open(path).map_err(|_| {
        AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "OpenAI transcription input could not be read",
        )
    })?;
    let declared_size = file.metadata().ok().map(|metadata| metadata.len());
    if declared_size.is_some_and(|size| size > MAXIMUM_UPLOAD_BYTES) {
        return Err(upload_too_large());
    }

    let maximum = usize::try_from(MAXIMUM_UPLOAD_BYTES).expect("25 MB fits usize");
    let mut bytes = Vec::with_capacity(
        declared_size
            .and_then(|size| usize::try_from(size).ok())
            .unwrap_or(0)
            .min(maximum),
    );
    let mut chunk = [0_u8; READ_CHUNK_BYTES];
    loop {
        if cancellation_requested(is_cancelled) {
            return Err(cancelled());
        }
        let read = file.read(&mut chunk).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "OpenAI transcription input could not be read",
            )
        })?;
        if read == 0 {
            break;
        }
        if bytes.len().saturating_add(read) > maximum {
            return Err(upload_too_large());
        }
        bytes.extend_from_slice(&chunk[..read]);
    }
    if bytes.is_empty() {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "OpenAI transcription input must not be empty",
        ));
    }
    if cancellation_requested(is_cancelled) {
        return Err(cancelled());
    }

    Ok(AudioInput {
        extension,
        content_type,
        bytes,
    })
}

fn supported_file_type(path: &Path) -> Result<(&'static str, &'static str), AdapterError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("flac") => Ok(("flac", "audio/flac")),
        Some("mp3" | "mpeg" | "mpga") => Ok((
            match extension.as_deref() {
                Some("mp3") => "mp3",
                Some("mpeg") => "mpeg",
                _ => "mpga",
            },
            "audio/mpeg",
        )),
        Some("mp4" | "m4a") => Ok((
            if extension.as_deref() == Some("mp4") {
                "mp4"
            } else {
                "m4a"
            },
            "audio/mp4",
        )),
        Some("ogg") => Ok(("ogg", "audio/ogg")),
        Some("wav") => Ok(("wav", "audio/wav")),
        Some("webm") => Ok(("webm", "audio/webm")),
        _ => Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "OpenAI transcription supports flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm input",
        )),
    }
}

fn normalized_language(language: Option<&str>) -> Result<Option<String>, AdapterError> {
    let Some(language) = language.filter(|value| !value.is_empty() && *value != "auto") else {
        return Ok(None);
    };
    let primary = language
        .split(['-', '_'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if primary.len() != 2 || !primary.bytes().all(|byte| byte.is_ascii_lowercase()) {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "OpenAI transcription language must contain an ISO-639-1 identifier",
        ));
    }
    Ok(Some(primary))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Model {
    Gpt4o,
    Gpt4oMini,
    Whisper,
}

impl Model {
    fn parse(value: &str) -> Result<Self, AdapterError> {
        match value {
            "gpt-4o-transcribe" => Ok(Self::Gpt4o),
            "gpt-4o-mini-transcribe" => Ok(Self::Gpt4oMini),
            "whisper-1" => Ok(Self::Whisper),
            _ => Err(AdapterError::new(
                AdapterErrorKind::InvalidInput,
                format!(
                    "OpenAI transcription model must be one of {}",
                    SUPPORTED_MODEL_IDS.join(", ")
                ),
            )),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::Gpt4o => "gpt-4o-transcribe",
            Self::Gpt4oMini => "gpt-4o-mini-transcribe",
            Self::Whisper => "whisper-1",
        }
    }

    const fn response_format(self) -> &'static str {
        match self {
            Self::Gpt4o | Self::Gpt4oMini => "json",
            Self::Whisper => "verbose_json",
        }
    }
}

struct AudioInput {
    extension: &'static str,
    content_type: &'static str,
    bytes: Vec<u8>,
}

struct MultipartBody {
    boundary: String,
    body: Vec<u8>,
}

fn multipart_body(input: &AudioInput, model: Model, language: Option<&str>) -> MultipartBody {
    let boundary = multipart_boundary(&input.bytes);
    let mut body = Vec::with_capacity(input.bytes.len().saturating_add(1_024));
    append_text_part(&mut body, &boundary, "model", model.as_str());
    append_text_part(
        &mut body,
        &boundary,
        "response_format",
        model.response_format(),
    );
    if model == Model::Whisper {
        append_text_part(&mut body, &boundary, "timestamp_granularities[]", "segment");
    }
    if let Some(language) = language {
        append_text_part(&mut body, &boundary, "language", language);
    }
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"file\"; filename=\"audio.{}\"\r\n",
            input.extension
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", input.content_type).as_bytes());
    body.extend_from_slice(&input.bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    MultipartBody { boundary, body }
}

fn multipart_boundary(input: &[u8]) -> String {
    for nonce in 0_u32..=u32::MAX {
        let candidate = format!("{MULTIPART_BOUNDARY_PREFIX}{nonce:08x}");
        if !input
            .windows(candidate.len())
            .any(|window| window == candidate.as_bytes())
        {
            return candidate;
        }
    }
    unreachable!("a bounded 25 MB input cannot contain every multipart boundary")
}

fn append_text_part(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(value.as_bytes());
    body.extend_from_slice(b"\r\n");
}

fn parse_response(
    body: &[u8],
    model: Model,
    requested_language: Option<String>,
) -> Result<TranscriptionResult, AdapterError> {
    let value = serde_json::from_slice::<Value>(body).map_err(|_| invalid_response())?;
    let text = required_string(&value, "text")?.to_owned();
    if model != Model::Whisper {
        return Ok(TranscriptionResult {
            text,
            language: requested_language,
            duration: None,
            segments: Vec::new(),
        });
    }

    let language = optional_string(&value, "language")?.map(str::to_owned);
    let duration = optional_seconds(&value, "duration")?;
    let segments = parse_segments(&value)?;
    Ok(TranscriptionResult {
        text,
        language: language.or(requested_language),
        duration,
        segments,
    })
}

fn parse_segments(value: &Value) -> Result<Vec<TranscriptionSegment>, AdapterError> {
    let Some(segments) = value.get("segments") else {
        return Ok(Vec::new());
    };
    let segments = segments.as_array().ok_or_else(invalid_response)?;
    let mut result = Vec::with_capacity(segments.len());
    let mut previous_end = Duration::ZERO;
    for segment in segments {
        let start = required_seconds(segment, "start")?;
        let end = required_seconds(segment, "end")?;
        let text = required_string(segment, "text")?.to_owned();
        if start >= end || start < previous_end {
            return Err(invalid_response());
        }
        previous_end = end;
        result.push(TranscriptionSegment { start, end, text });
    }
    Ok(result)
}

fn required_string<'a>(value: &'a Value, key: &str) -> Result<&'a str, AdapterError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(invalid_response)
}

fn optional_string<'a>(value: &'a Value, key: &str) -> Result<Option<&'a str>, AdapterError> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value.as_str().map(Some).ok_or_else(invalid_response),
    }
}

fn required_seconds(value: &Value, key: &str) -> Result<Duration, AdapterError> {
    let seconds = value
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(invalid_response)?;
    duration_from_seconds(seconds)
}

fn optional_seconds(value: &Value, key: &str) -> Result<Option<Duration>, AdapterError> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_f64()
            .ok_or_else(invalid_response)
            .and_then(duration_from_seconds)
            .map(Some),
    }
}

fn duration_from_seconds(seconds: f64) -> Result<Duration, AdapterError> {
    Duration::try_from_secs_f64(seconds).map_err(|_| invalid_response())
}

fn invalid_response() -> AdapterError {
    AdapterError::new(
        AdapterErrorKind::ResponseInvalid,
        "OpenAI transcription returned an invalid response",
    )
}

fn upload_too_large() -> AdapterError {
    AdapterError::new(
        AdapterErrorKind::InvalidInput,
        "OpenAI transcription input exceeds the 25 MB upload limit",
    )
}

fn cancelled() -> AdapterError {
    AdapterError::new(
        AdapterErrorKind::Cancelled,
        "OpenAI transcription was cancelled",
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, mpsc};
    use std::thread;
    use std::time::Instant;

    use super::*;

    static FIXTURE_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        path: std::path::PathBuf,
    }

    impl Fixture {
        fn new(extension: &str, contents: &[u8]) -> Self {
            let counter = FIXTURE_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "cuttledoc-openai-{}-{counter}.{extension}",
                std::process::id()
            ));
            fs::write(&path, contents).expect("write fixture");
            Self { path }
        }

        fn sparse(extension: &str, length: u64) -> Self {
            let fixture = Self::new(extension, b"");
            fs::OpenOptions::new()
                .write(true)
                .open(&fixture.path)
                .expect("open sparse fixture")
                .set_len(length)
                .expect("size sparse fixture");
            fixture
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
        }
    }

    struct MockServer {
        endpoint: String,
        address: std::net::SocketAddr,
        request: mpsc::Receiver<Vec<u8>>,
        handle: Option<thread::JoinHandle<()>>,
    }

    impl MockServer {
        fn spawn(status: u16, body: Vec<u8>, delay: Duration) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
            let address = listener.local_addr().expect("mock address");
            let (request_sender, request) = mpsc::channel();
            let handle = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("accept request");
                let Some(request) = read_http_request(&mut stream) else {
                    return;
                };
                request_sender.send(request).expect("capture request");
                if !delay.is_zero() {
                    thread::sleep(delay);
                }
                let reason = if status == 200 { "OK" } else { "Error" };
                let headers = format!(
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(headers.as_bytes());
                let _ = stream.write_all(&body);
            });
            Self {
                endpoint: format!("http://{address}/v1/audio/transcriptions"),
                address,
                request,
                handle: Some(handle),
            }
        }

        fn captured_request(&self) -> Vec<u8> {
            self.request
                .recv_timeout(Duration::from_secs(2))
                .expect("captured request")
        }
    }

    impl Drop for MockServer {
        fn drop(&mut self) {
            if let Some(handle) = self.handle.take() {
                let _ = TcpStream::connect(self.address);
                handle.join().expect("join mock server");
            }
        }
    }

    fn read_http_request(stream: &mut TcpStream) -> Option<Vec<u8>> {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .expect("read timeout");
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4_096];
        let header_end = loop {
            let read = stream.read(&mut chunk).expect("read request");
            if read == 0 {
                return None;
            }
            request.extend_from_slice(&chunk[..read]);
            if let Some(index) = find_bytes(&request, b"\r\n\r\n") {
                break index + 4;
            }
        };
        let headers = std::str::from_utf8(&request[..header_end]).expect("UTF-8 headers");
        let content_length = headers
            .lines()
            .find_map(|line| {
                line.split_once(':').and_then(|(name, value)| {
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().expect("content length"))
                })
            })
            .expect("content length header");
        let expected = header_end + content_length;
        while request.len() < expected {
            let read = stream.read(&mut chunk).expect("read request body");
            assert!(read > 0, "request body ended early");
            request.extend_from_slice(&chunk[..read]);
        }
        Some(request)
    }

    fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
        haystack
            .windows(needle.len())
            .position(|window| window == needle)
    }

    fn engine(server: &MockServer, timeout: Duration) -> OpenAiTranscriptionEngine {
        OpenAiTranscriptionEngine::create_for_endpoint(
            EngineOptions {
                credential: Credential::new("sk-test-secret".to_owned()).expect("valid credential"),
                timeout,
            },
            &server.endpoint,
        )
        .expect("create engine")
    }

    #[test]
    fn credential_debug_output_is_redacted() {
        let credential = Credential::new("sk-test-secret".to_owned()).expect("valid credential");
        let debug = format!("{credential:?}");
        assert_eq!(debug, "Credential([REDACTED])");
        assert!(!debug.contains("sk-test-secret"));
    }

    #[test]
    fn invalid_credentials_return_bounded_diagnostics() {
        for value in ["", " ", " sk-test", "sk-test\n"] {
            let error = Credential::new(value.to_owned()).expect_err("credential must fail");
            assert_eq!(error.kind, AdapterErrorKind::CredentialsMissing);
            assert!(!error.message.contains("sk-test"));
        }
    }

    #[test]
    fn zero_timeout_and_oversized_upload_fail_before_network_io() {
        let error = OpenAiTranscriptionEngine::create(EngineOptions {
            credential: Credential::new("sk-test-secret".to_owned()).expect("valid credential"),
            timeout: Duration::ZERO,
        })
        .err()
        .expect("zero timeout must fail");
        assert_eq!(error.kind, AdapterErrorKind::InvalidInput);

        let server = MockServer::spawn(200, br#"{"text":"unused"}"#.to_vec(), Duration::ZERO);
        let fixture = Fixture::sparse("wav", MAXIMUM_UPLOAD_BYTES + 1);
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || false)
            .expect_err("oversized input must fail");
        assert_eq!(error.kind, AdapterErrorKind::InvalidInput);
        assert!(error.message.contains("25 MB"));
    }

    #[test]
    fn request_pins_endpoint_fields_model_language_and_safe_filename() {
        let server = MockServer::spawn(200, br#"{"text":"Hallo Welt"}"#.to_vec(), Duration::ZERO);
        let fixture = Fixture::new("ogg", b"OggS test audio");
        let result = engine(&server, Duration::from_secs(2))
            .transcribe_file(
                &fixture.path,
                &TranscriptionRequest {
                    model: "gpt-4o-mini-transcribe".to_owned(),
                    language: Some("de-DE".to_owned()),
                },
                || false,
            )
            .expect("transcription result");
        assert_eq!(result.text, "Hallo Welt");
        assert_eq!(result.language.as_deref(), Some("de"));
        assert_eq!(result.duration, None);
        assert!(result.segments.is_empty());

        let request = server.captured_request();
        let request = String::from_utf8_lossy(&request);
        assert!(request.starts_with("POST /v1/audio/transcriptions HTTP/1.1\r\n"));
        assert!(request.contains("authorization: Bearer sk-test-secret\r\n"));
        assert!(request.contains("name=\"model\"\r\n\r\ngpt-4o-mini-transcribe\r\n"));
        assert!(request.contains("name=\"response_format\"\r\n\r\njson\r\n"));
        assert!(request.contains("name=\"language\"\r\n\r\nde\r\n"));
        assert!(request.contains("filename=\"audio.ogg\"\r\n"));
        assert!(request.contains("Content-Type: audio/ogg\r\n"));
        assert!(!request.contains(fixture.path.to_string_lossy().as_ref()));
    }

    #[test]
    fn whisper_response_maps_duration_language_and_ordered_segments() {
        let server = MockServer::spawn(
            200,
            br#"{"text":"Hello world","language":"english","duration":1.5,"segments":[{"start":0.0,"end":0.75,"text":" Hello"},{"start":0.75,"end":1.5,"text":" world"}]}"#.to_vec(),
            Duration::ZERO,
        );
        let fixture = Fixture::new("wav", b"RIFF test audio");
        let result = engine(&server, Duration::from_secs(2))
            .transcribe_file(
                &fixture.path,
                &TranscriptionRequest {
                    model: "whisper-1".to_owned(),
                    language: None,
                },
                || false,
            )
            .expect("transcription result");
        assert_eq!(result.text, "Hello world");
        assert_eq!(result.language.as_deref(), Some("english"));
        assert_eq!(result.duration, Some(Duration::from_millis(1_500)));
        assert_eq!(result.segments.len(), 2);
        assert_eq!(result.segments[1].start, Duration::from_millis(750));

        let request = String::from_utf8_lossy(&server.captured_request()).into_owned();
        assert!(request.contains("name=\"response_format\"\r\n\r\nverbose_json\r\n"));
        assert!(request.contains("name=\"timestamp_granularities[]\"\r\n\r\nsegment\r\n"));
        assert!(!request.contains("name=\"language\""));
    }

    #[test]
    fn invalid_model_language_file_and_response_are_stable() {
        let fixture = Fixture::new("txt", b"not audio");
        let server = MockServer::spawn(200, br#"{"text":"unused"}"#.to_vec(), Duration::ZERO);
        let invalid_model_engine = engine(&server, Duration::from_secs(2));
        let error = invalid_model_engine
            .transcribe_file(
                &fixture.path,
                &TranscriptionRequest {
                    model: "unknown".to_owned(),
                    language: None,
                },
                || false,
            )
            .expect_err("model must fail");
        assert_eq!(error.kind, AdapterErrorKind::InvalidInput);
        drop(server);

        let server = MockServer::spawn(200, br#"{"text":"unused"}"#.to_vec(), Duration::ZERO);
        let fixture = Fixture::new("wav", b"RIFF test audio");
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(
                &fixture.path,
                &TranscriptionRequest {
                    model: DEFAULT_MODEL_ID.to_owned(),
                    language: Some("english".to_owned()),
                },
                || false,
            )
            .expect_err("language must fail");
        assert_eq!(error.kind, AdapterErrorKind::InvalidInput);
        drop(server);

        let server = MockServer::spawn(200, br#"{"text":"unused"}"#.to_vec(), Duration::ZERO);
        let fixture = Fixture::new("txt", b"not audio");
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || false)
            .expect_err("file type must fail");
        assert_eq!(error.kind, AdapterErrorKind::InvalidInput);
        drop(server);

        let server = MockServer::spawn(200, br#"{"unexpected":true}"#.to_vec(), Duration::ZERO);
        let fixture = Fixture::new("mp3", b"ID3 test audio");
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || false)
            .expect_err("response must fail");
        assert_eq!(error.kind, AdapterErrorKind::ResponseInvalid);
        assert!(!error.message.contains("unexpected"));
        let _ = server.captured_request();
    }

    #[test]
    fn provider_statuses_are_bounded_and_credentials_are_never_reported() {
        for (status, expected_kind) in [
            (401, AdapterErrorKind::AuthenticationFailed),
            (403, AdapterErrorKind::AuthenticationFailed),
            (429, AdapterErrorKind::RateLimited),
            (500, AdapterErrorKind::TransportFailed),
        ] {
            let server = MockServer::spawn(
                status,
                br#"{"error":{"message":"echo sk-test-secret"}}"#.to_vec(),
                Duration::ZERO,
            );
            let fixture = Fixture::new("m4a", b"test audio");
            let error = engine(&server, Duration::from_secs(2))
                .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || false)
                .expect_err("provider status must fail");
            assert_eq!(error.kind, expected_kind);
            assert!(!error.to_string().contains("sk-test-secret"));
            let _ = server.captured_request();
        }
    }

    #[test]
    fn response_body_is_bounded_before_json_parsing() {
        let server = MockServer::spawn(200, vec![b'x'; MAXIMUM_RESPONSE_BYTES + 1], Duration::ZERO);
        let fixture = Fixture::new("flac", b"fLaC test audio");
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || false)
            .expect_err("large response must fail");
        assert_eq!(error.kind, AdapterErrorKind::ResponseInvalid);
        assert!(error.message.contains("size limit"));
        let _ = server.captured_request();
    }

    #[test]
    fn timeout_and_active_cancellation_drop_the_inflight_request() {
        let timeout_server = MockServer::spawn(
            200,
            br#"{"text":"late"}"#.to_vec(),
            Duration::from_millis(150),
        );
        let fixture = Fixture::new("webm", b"test audio");
        let timeout_engine = engine(&timeout_server, Duration::from_millis(25));
        let started_at = Instant::now();
        let error = timeout_engine
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || false)
            .expect_err("request must time out");
        assert_eq!(error.kind, AdapterErrorKind::TimedOut);
        assert!(started_at.elapsed() < Duration::from_millis(125));
        let _ = timeout_server.captured_request();
        drop(timeout_server);

        let cancellation_server = MockServer::spawn(
            200,
            br#"{"text":"late"}"#.to_vec(),
            Duration::from_millis(150),
        );
        let cancellation_engine = engine(&cancellation_server, Duration::from_secs(2));
        let cancelled = Arc::new(AtomicBool::new(false));
        let setter = Arc::clone(&cancelled);
        let cancel_thread = thread::spawn(move || {
            thread::sleep(Duration::from_millis(25));
            setter.store(true, Ordering::Release);
        });
        let started_at = Instant::now();
        let error = cancellation_engine
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || {
                cancelled.load(Ordering::Acquire)
            })
            .expect_err("request must be cancelled");
        cancel_thread.join().expect("join cancellation trigger");
        assert_eq!(error.kind, AdapterErrorKind::Cancelled);
        assert!(started_at.elapsed() < Duration::from_millis(125));
        let _ = cancellation_server.captured_request();
    }

    #[test]
    fn pre_cancelled_and_panicking_callbacks_never_reach_the_network() {
        let server = MockServer::spawn(200, br#"{"text":"unused"}"#.to_vec(), Duration::ZERO);
        let fixture = Fixture::new("mp4", b"test audio");
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || true)
            .expect_err("pre-cancelled request must fail");
        assert_eq!(error.kind, AdapterErrorKind::Cancelled);
        drop(server);

        let server = MockServer::spawn(200, br#"{"text":"unused"}"#.to_vec(), Duration::ZERO);
        let error = engine(&server, Duration::from_secs(2))
            .transcribe_file(&fixture.path, &TranscriptionRequest::default(), || {
                panic!("caller cancellation callback panic")
            })
            .expect_err("panicking callback must cancel");
        assert_eq!(error.kind, AdapterErrorKind::Cancelled);
        drop(server);
    }

    #[test]
    fn overlapping_whisper_segments_are_rejected() {
        let error = parse_response(
            br#"{"text":"bad","duration":2.0,"segments":[{"start":0.0,"end":1.5,"text":"one"},{"start":1.0,"end":2.0,"text":"two"}]}"#,
            Model::Whisper,
            None,
        )
        .expect_err("overlap must fail");
        assert_eq!(error.kind, AdapterErrorKind::ResponseInvalid);
    }

    #[test]
    fn multipart_boundary_never_collides_with_input() {
        let first = format!("{MULTIPART_BOUNDARY_PREFIX}00000000");
        let boundary = multipart_boundary(first.as_bytes());
        assert_eq!(boundary, format!("{MULTIPART_BOUNDARY_PREFIX}00000001"));
    }
}
