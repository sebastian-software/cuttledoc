//! Private OpenRouter boundary pinned to the accepted Gemini endpoint tuple.
//!
//! Credentials are accepted only in memory or read from an environment
//! variable. They are never exposed through `Debug`, errors, or results.

use std::error::Error;
use std::fmt;
use std::time::Duration;

use serde_json::{Value, json};

pub const BACKEND_ID: &str = "openrouter";
pub const MODEL_ID: &str = "gemini-3.6-flash";
pub const REQUESTED_MODEL_ID: &str = "google/gemini-3.6-flash";
pub const API_KEY_ENV: &str = "OPENROUTER_API_KEY";
pub const ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";
pub const PROVIDER_SLUG: &str = "google-vertex/global";
pub const PROVIDER_NAME: &str = "Google";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

const ALLOWED_RESPONSE_MODEL_IDS: &[&str] = &[
    "google/gemini-3.6-flash",
    "google/gemini-3.6-flash-20260721",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BuildSupport {
    Native,
    UnsupportedPlatform,
}

pub const fn build_support() -> BuildSupport {
    if cfg!(all(
        target_os = "macos",
        target_arch = "aarch64",
        cuttledoc_openrouter_native
    )) {
        BuildSupport::Native
    } else {
        BuildSupport::UnsupportedPlatform
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterErrorKind {
    UnsupportedPlatform,
    CredentialsMissing,
    InvalidInput,
    AuthenticationFailed,
    TransportFailed,
    ResponseInvalid,
    ProviderDrift,
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

pub struct Credential(String);

impl Credential {
    pub fn new(value: String) -> Result<Self, AdapterError> {
        if value.trim().is_empty()
            || value.trim() != value
            || value.chars().any(|character| character.is_control())
        {
            return Err(AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                "OpenRouter API key is missing or invalid",
            ));
        }
        Ok(Self(value))
    }

    pub fn from_environment() -> Result<Self, AdapterError> {
        let value = std::env::var(API_KEY_ENV).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                format!("OpenRouter requires {API_KEY_ENV} or an in-memory credential"),
            )
        })?;
        Self::new(value)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OutputFormat {
    Text,
    JsonObject,
    JsonSchema {
        name: String,
        schema: String,
        strict: bool,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct GenerationRequest {
    pub messages: Vec<Message>,
    pub output_format: OutputFormat,
    pub maximum_tokens: u32,
    pub temperature: Option<f32>,
    pub seed: Option<u64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FinishReason {
    Stop,
    Length,
    Other,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationResult {
    pub text: String,
    pub finish_reason: FinishReason,
    pub prompt_tokens: Option<u64>,
    pub generated_tokens: Option<u64>,
}

pub struct EngineOptions {
    pub credential: Credential,
    pub timeout: Duration,
}

pub struct OpenRouterEngine {
    credential: Credential,
    timeout: Duration,
}

impl OpenRouterEngine {
    pub fn create(options: EngineOptions) -> Result<Self, AdapterError> {
        if options.timeout.is_zero() {
            return Err(AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "OpenRouter timeout must be greater than zero",
            ));
        }
        if build_support() != BuildSupport::Native {
            return Err(AdapterError::new(
                AdapterErrorKind::UnsupportedPlatform,
                "the OpenRouter Foundation adapter requires macOS on Apple Silicon",
            ));
        }
        Ok(Self {
            credential: options.credential,
            timeout: options.timeout,
        })
    }

    pub fn generate(
        &self,
        request: &GenerationRequest,
        is_cancelled: impl Fn() -> bool,
    ) -> Result<GenerationResult, AdapterError> {
        if is_cancelled() {
            return Err(cancelled());
        }
        let body = request_body(request)?.to_string();
        let response = platform::send(&self.credential.0, &body, self.timeout, &is_cancelled)?;
        if is_cancelled() {
            return Err(cancelled());
        }
        if response.http_status == 401 || response.http_status == 403 {
            return Err(AdapterError::new(
                AdapterErrorKind::AuthenticationFailed,
                "OpenRouter rejected the configured credential",
            ));
        }
        if !(200..300).contains(&response.http_status) {
            return Err(AdapterError::new(
                AdapterErrorKind::TransportFailed,
                format!(
                    "OpenRouter request failed with HTTP {}",
                    response.http_status
                ),
            ));
        }
        parse_response(&response.body)
    }
}

fn request_body(request: &GenerationRequest) -> Result<Value, AdapterError> {
    if request.messages.is_empty()
        || request.maximum_tokens == 0
        || request
            .messages
            .iter()
            .any(|message| message.content.trim().is_empty())
        || request
            .temperature
            .is_some_and(|temperature| temperature != 0.0)
        || request.seed.is_some_and(|seed| seed != 0)
    {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "Gemini requires non-empty messages, a positive token limit, greedy decoding, and seed zero",
        ));
    }
    let messages = request
        .messages
        .iter()
        .map(|message| {
            json!({
                "role": match message.role {
                    Role::System => "system",
                    Role::User => "user",
                    Role::Assistant => "assistant",
                },
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    let mut body = json!({
        "model": REQUESTED_MODEL_ID,
        "messages": messages,
        "max_tokens": request.maximum_tokens,
        "seed": request.seed.unwrap_or(0),
        "reasoning": {
            "effort": "low",
            "exclude": true,
        },
        "provider": {
            "only": [PROVIDER_SLUG],
            "allow_fallbacks": false,
            "require_parameters": true,
            "data_collection": "deny",
            "zdr": true,
        },
    });
    body["response_format"] = match &request.output_format {
        OutputFormat::Text => return Ok(body),
        OutputFormat::JsonObject => json!({ "type": "json_object" }),
        OutputFormat::JsonSchema {
            name,
            schema,
            strict,
        } => {
            let schema: Value = serde_json::from_str(schema).map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::InvalidInput,
                    "OpenRouter JSON schema is not valid JSON",
                )
            })?;
            json!({
                "type": "json_schema",
                "json_schema": {
                    "name": name,
                    "strict": strict,
                    "schema": schema,
                },
            })
        }
    };
    Ok(body)
}

fn parse_response(response: &str) -> Result<GenerationResult, AdapterError> {
    let value: Value = serde_json::from_str(response).map_err(|_| {
        AdapterError::new(
            AdapterErrorKind::ResponseInvalid,
            "OpenRouter returned invalid JSON",
        )
    })?;
    if value["provider"].as_str() != Some(PROVIDER_NAME) {
        return Err(AdapterError::new(
            AdapterErrorKind::ProviderDrift,
            "OpenRouter did not use the pinned Google provider",
        ));
    }
    if !value["model"]
        .as_str()
        .is_some_and(|model| ALLOWED_RESPONSE_MODEL_IDS.contains(&model))
    {
        return Err(AdapterError::new(
            AdapterErrorKind::ProviderDrift,
            "OpenRouter returned an unpinned Gemini model identity",
        ));
    }
    let choice = value["choices"]
        .as_array()
        .and_then(|choices| choices.first())
        .ok_or_else(|| {
            AdapterError::new(
                AdapterErrorKind::ResponseInvalid,
                "OpenRouter response has no completion choice",
            )
        })?;
    let text = choice["message"]["content"]
        .as_str()
        .ok_or_else(|| {
            AdapterError::new(
                AdapterErrorKind::ResponseInvalid,
                "OpenRouter completion has no text content",
            )
        })?
        .trim()
        .to_owned();
    if text.is_empty() {
        return Err(AdapterError::new(
            AdapterErrorKind::ResponseInvalid,
            "OpenRouter completion text is empty",
        ));
    }
    let finish_reason = match choice["finish_reason"].as_str() {
        Some("stop") => FinishReason::Stop,
        Some("length") => FinishReason::Length,
        _ => FinishReason::Other,
    };
    Ok(GenerationResult {
        text,
        finish_reason,
        prompt_tokens: value["usage"]["prompt_tokens"].as_u64(),
        generated_tokens: value["usage"]["completion_tokens"].as_u64(),
    })
}

fn cancelled() -> AdapterError {
    AdapterError::new(
        AdapterErrorKind::Cancelled,
        "OpenRouter generation was cancelled",
    )
}

struct PlatformResponse {
    http_status: u16,
    body: String,
}

#[cfg(all(
    target_os = "macos",
    target_arch = "aarch64",
    cuttledoc_openrouter_native
))]
#[allow(unsafe_code)]
mod platform {
    use std::ffi::{CStr, CString, c_char, c_void};
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::ptr;
    use std::time::Duration;

    use super::{AdapterError, AdapterErrorKind, PlatformResponse};

    const STATUS_OK: i32 = 0;
    const STATUS_INVALID_INPUT: i32 = 1;
    const STATUS_TRANSPORT_FAILED: i32 = 2;
    const STATUS_CANCELLED: i32 = 3;

    type CancelCallback = extern "C" fn(*mut c_void) -> i32;

    unsafe extern "C" {
        fn cuttledoc_openrouter_send(
            api_key: *const c_char,
            request_json: *const c_char,
            timeout_milliseconds: u64,
            cancel_callback: CancelCallback,
            callback_context: *mut c_void,
            http_status_output: *mut i32,
            response_output: *mut *mut c_char,
            error_output: *mut *mut c_char,
        ) -> i32;
        fn cuttledoc_openrouter_free_string(value: *mut c_char);
    }

    pub fn send(
        api_key: &str,
        request_json: &str,
        timeout: Duration,
        is_cancelled: &dyn Fn() -> bool,
    ) -> Result<PlatformResponse, AdapterError> {
        let api_key = CString::new(api_key).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                "OpenRouter API key is invalid",
            )
        })?;
        let request_json = CString::new(request_json).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "OpenRouter request contains an interior NUL byte",
            )
        })?;
        let timeout_milliseconds = u64::try_from(timeout.as_millis())
            .unwrap_or(u64::MAX)
            .max(1);
        let mut http_status = 0_i32;
        let mut response_output = ptr::null_mut();
        let mut error_output = ptr::null_mut();
        let status = unsafe {
            cuttledoc_openrouter_send(
                api_key.as_ptr(),
                request_json.as_ptr(),
                timeout_milliseconds,
                receive_cancellation,
                ptr::from_ref(&is_cancelled).cast_mut().cast(),
                &mut http_status,
                &mut response_output,
                &mut error_output,
            )
        };
        if status != STATUS_OK {
            let kind = match status {
                STATUS_INVALID_INPUT => AdapterErrorKind::InvalidInput,
                STATUS_CANCELLED => AdapterErrorKind::Cancelled,
                STATUS_TRANSPORT_FAILED => AdapterErrorKind::TransportFailed,
                _ => AdapterErrorKind::TransportFailed,
            };
            return Err(AdapterError::new(
                kind,
                take_native_string(error_output)
                    .unwrap_or_else(|| "OpenRouter request failed".to_owned()),
            ));
        }
        let body = take_native_string(response_output).ok_or_else(|| {
            AdapterError::new(
                AdapterErrorKind::ResponseInvalid,
                "OpenRouter returned no response body",
            )
        })?;
        let http_status = u16::try_from(http_status).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::ResponseInvalid,
                "OpenRouter returned an invalid HTTP status",
            )
        })?;
        Ok(PlatformResponse { http_status, body })
    }

    extern "C" fn receive_cancellation(context: *mut c_void) -> i32 {
        if context.is_null() {
            return 1;
        }
        let is_cancelled = unsafe { &*context.cast::<&dyn Fn() -> bool>() };
        catch_unwind(AssertUnwindSafe(is_cancelled))
            .unwrap_or(true)
            .into()
    }

    fn take_native_string(value: *mut c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let result = unsafe { CStr::from_ptr(value) }
            .to_string_lossy()
            .into_owned();
        unsafe { cuttledoc_openrouter_free_string(value) };
        Some(result)
    }
}

#[cfg(not(all(
    target_os = "macos",
    target_arch = "aarch64",
    cuttledoc_openrouter_native
)))]
mod platform {
    use std::time::Duration;

    use super::{AdapterError, AdapterErrorKind, PlatformResponse};

    pub fn send(
        _api_key: &str,
        _request_json: &str,
        _timeout: Duration,
        _is_cancelled: &dyn Fn() -> bool,
    ) -> Result<PlatformResponse, AdapterError> {
        Err(AdapterError::new(
            AdapterErrorKind::UnsupportedPlatform,
            "the OpenRouter Foundation adapter requires macOS on Apple Silicon",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> GenerationRequest {
        GenerationRequest {
            messages: vec![Message {
                role: Role::User,
                content: "Correct this.".to_owned(),
            }],
            output_format: OutputFormat::JsonSchema {
                name: "correction".to_owned(),
                schema: r#"{"type":"object"}"#.to_owned(),
                strict: true,
            },
            maximum_tokens: 256,
            temperature: Some(0.0),
            seed: Some(0),
        }
    }

    #[test]
    fn request_pins_model_provider_privacy_and_reasoning() {
        let body = request_body(&request()).expect("valid request");
        assert_eq!(body["model"], REQUESTED_MODEL_ID);
        assert_eq!(body["provider"]["only"][0], PROVIDER_SLUG);
        assert_eq!(body["provider"]["allow_fallbacks"], false);
        assert_eq!(body["provider"]["data_collection"], "deny");
        assert_eq!(body["provider"]["zdr"], true);
        assert_eq!(body["reasoning"]["effort"], "low");
        assert_eq!(body["response_format"]["type"], "json_schema");
    }

    #[test]
    fn response_requires_the_pinned_provider_and_model() {
        let response = json!({
            "model": "google/gemini-3.6-flash-20260721",
            "provider": "Google",
            "choices": [{
                "finish_reason": "stop",
                "message": { "content": "{\"sections\":[]}" },
            }],
            "usage": {
                "prompt_tokens": 20,
                "completion_tokens": 5,
            },
        });
        let result = parse_response(&response.to_string()).expect("valid response");
        assert_eq!(result.finish_reason, FinishReason::Stop);
        assert_eq!(result.prompt_tokens, Some(20));

        let mut drifted = response;
        drifted["provider"] = Value::String("Another provider".to_owned());
        assert_eq!(
            parse_response(&drifted.to_string())
                .expect_err("provider drift must fail")
                .kind,
            AdapterErrorKind::ProviderDrift
        );
    }

    #[test]
    fn credentials_never_implement_debug_or_reach_errors() {
        let secret = "test-secret-that-must-not-appear";
        let credential = Credential::new(secret.to_owned()).expect("valid credential");
        let error = OpenRouterEngine::create(EngineOptions {
            credential,
            timeout: Duration::ZERO,
        })
        .err()
        .expect("zero timeout must fail");
        assert!(!error.to_string().contains(secret));
    }

    #[test]
    fn credentials_reject_whitespace_without_echoing_the_value() {
        let secret = " secret-with-whitespace ";
        let error = Credential::new(secret.to_owned())
            .err()
            .expect("whitespace must fail");
        assert_eq!(error.kind, AdapterErrorKind::CredentialsMissing);
        assert!(!error.to_string().contains(secret));
    }

    #[test]
    fn invalid_responses_do_not_echo_remote_content() {
        let remote_content = "remote-content-that-must-not-reach-errors";
        let error = parse_response(remote_content).expect_err("invalid JSON must fail");
        assert_eq!(error.kind, AdapterErrorKind::ResponseInvalid);
        assert!(!error.to_string().contains(remote_content));
    }
}
