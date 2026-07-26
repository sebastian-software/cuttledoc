use std::path::PathBuf;

use cuttledoc::{
    AudioFormat, Availability, BackendId, BackendSelection, CancellationToken, ErrorCode,
    MediaDecodeOptions, PcmBuffer, TranscribeOptions, TranscriptionResult,
    recognition_capabilities, transcribe_file_with_cancellation, transcribe_pcm_with_cancellation,
};
use napi::bindgen_prelude::{AbortSignal, AsyncTask, Buffer};
use napi::{Env, Error, Result, Status, Task};
use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendCapability {
    pub id: String,
    pub available: bool,
    #[napi(js_name = "unavailableReason")]
    pub unavailable_reason: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PcmTranscriptionOptions {
    pub language: String,
    pub backend: Option<String>,
    #[napi(js_name = "modelPath")]
    pub model_path: Option<String>,
    #[napi(js_name = "sampleRate")]
    pub sample_rate: Option<u32>,
}

#[napi(object)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FileTranscriptionOptions {
    pub language: String,
    pub backend: Option<String>,
    #[napi(js_name = "modelPath")]
    pub model_path: Option<String>,
    #[napi(js_name = "ffmpegPath")]
    pub ffmpeg_path: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptWord {
    #[napi(js_name = "startMs")]
    pub start_ms: f64,
    #[napi(js_name = "endMs")]
    pub end_ms: f64,
    pub text: String,
    pub confidence: Option<f64>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptSegment {
    #[napi(js_name = "startMs")]
    pub start_ms: f64,
    #[napi(js_name = "endMs")]
    pub end_ms: f64,
    pub text: String,
    pub confidence: Option<f64>,
    pub words: Vec<TranscriptWord>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq)]
pub struct PcmTranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub backend: String,
    pub model: Option<String>,
    #[napi(js_name = "mediaDurationMs")]
    pub media_duration_ms: f64,
    #[napi(js_name = "processingDurationMs")]
    pub processing_duration_ms: f64,
    pub segments: Vec<TranscriptSegment>,
}

pub struct PcmTranscriptionTask {
    pcm: Vec<u8>,
    options: PcmTranscriptionOptions,
    cancellation: CancellationToken,
}

pub struct FileTranscriptionTask {
    path: PathBuf,
    options: FileTranscriptionOptions,
    cancellation: CancellationToken,
}

impl Task for PcmTranscriptionTask {
    type Output = PcmTranscriptionResult;
    type JsValue = PcmTranscriptionResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let format =
            AudioFormat::new(self.options.sample_rate.unwrap_or(16_000), 1).map_err(node_error)?;
        let input = PcmBuffer::from_f32le_bytes(format, &self.pcm).map_err(node_error)?;
        let options = transcribe_options(
            &self.options.language,
            self.options.backend.as_deref(),
            self.options.model_path.as_deref(),
        )?;
        let result = transcribe_pcm_with_cancellation(&input, &options, &self.cancellation)
            .map_err(node_error)?;
        Ok(map_transcription_result(result))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

impl Task for FileTranscriptionTask {
    type Output = PcmTranscriptionResult;
    type JsValue = PcmTranscriptionResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let transcribe_options = transcribe_options(
            &self.options.language,
            self.options.backend.as_deref(),
            self.options.model_path.as_deref(),
        )?;
        let result = transcribe_file_with_cancellation(
            &self.path,
            &transcribe_options,
            &MediaDecodeOptions {
                ffmpeg_path: self.options.ffmpeg_path.as_deref().map(PathBuf::from),
            },
            &self.cancellation,
        )
        .map_err(node_error)?;
        Ok(map_transcription_result(result))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

fn transcribe_options(
    language: &str,
    backend: Option<&str>,
    model_path: Option<&str>,
) -> Result<TranscribeOptions> {
    let backend = match backend {
        None | Some("auto") => BackendSelection::Auto,
        Some(value) => BackendSelection::Id(
            BackendId::new(value)
                .map_err(|error| Error::new(Status::InvalidArg, error.to_string()))?,
        ),
    };
    Ok(TranscribeOptions {
        backend,
        model_path: model_path.map(PathBuf::from),
        language: Some(language.to_owned()),
        ..TranscribeOptions::default()
    })
}

#[napi]
pub fn version() -> String {
    cuttledoc::VERSION.to_owned()
}

#[napi(js_name = "recognitionBackends")]
pub fn recognition_backends() -> Vec<BackendCapability> {
    recognition_capabilities()
        .into_iter()
        .map(|capability| {
            let (available, unavailable_reason) = match capability.availability {
                Availability::Available => (true, None),
                Availability::Unavailable { reason, .. } => {
                    (false, Some(reason.as_str().to_owned()))
                }
            };
            BackendCapability {
                id: capability.backend.to_string(),
                available,
                unavailable_reason,
            }
        })
        .collect()
}

#[napi(js_name = "transcribePcm")]
pub fn transcribe_pcm(
    pcm: Buffer,
    options: PcmTranscriptionOptions,
    signal: Option<AbortSignal>,
) -> AsyncTask<PcmTranscriptionTask> {
    let cancellation = cancellation_token(signal.as_ref());
    AsyncTask::with_optional_signal(
        PcmTranscriptionTask {
            pcm: pcm.as_ref().to_vec(),
            options,
            cancellation,
        },
        signal,
    )
}

#[napi(js_name = "transcribeFile")]
pub fn transcribe_file(
    path: String,
    options: FileTranscriptionOptions,
    signal: Option<AbortSignal>,
) -> AsyncTask<FileTranscriptionTask> {
    let cancellation = cancellation_token(signal.as_ref());
    AsyncTask::with_optional_signal(
        FileTranscriptionTask {
            path: PathBuf::from(path),
            options,
            cancellation,
        },
        signal,
    )
}

fn cancellation_token(signal: Option<&AbortSignal>) -> CancellationToken {
    let cancellation = CancellationToken::new();
    if let Some(abort_signal) = signal {
        let cancellation_on_abort = cancellation.clone();
        abort_signal.on_abort(move || cancellation_on_abort.cancel());
    }
    cancellation
}

fn map_transcription_result(result: TranscriptionResult) -> PcmTranscriptionResult {
    PcmTranscriptionResult {
        text: result.text,
        language: result.language,
        backend: result.backend.to_string(),
        model: result.model.map(|model| model.to_string()),
        media_duration_ms: duration_milliseconds(result.media_duration),
        processing_duration_ms: duration_milliseconds(result.processing_duration),
        segments: result
            .segments
            .into_iter()
            .map(|segment| TranscriptSegment {
                start_ms: duration_milliseconds(segment.range.start),
                end_ms: duration_milliseconds(segment.range.end),
                text: segment.text,
                confidence: segment.confidence.map(f64::from),
                words: segment
                    .words
                    .into_iter()
                    .map(|word| TranscriptWord {
                        start_ms: duration_milliseconds(word.range.start),
                        end_ms: duration_milliseconds(word.range.end),
                        text: word.text,
                        confidence: word.confidence.map(f64::from),
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn duration_milliseconds(duration: std::time::Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

fn node_error(error: cuttledoc::CuttledocError) -> Error {
    let status = match error.code {
        ErrorCode::InvalidInput => Status::InvalidArg,
        ErrorCode::Cancelled => Status::Cancelled,
        _ => Status::GenericFailure,
    };
    Error::new(status, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cuttledoc::{BackendId, TimeRange, TranscriptionSegment, WordTimestamp};
    use std::time::Duration;

    #[test]
    fn node_boundary_uses_the_rust_capability_source() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
        let capability = recognition_capabilities()
            .into_iter()
            .find(|capability| capability.backend.as_str() == "apple-speech")
            .expect("Apple Speech is a known backend");
        let (available, unavailable_reason) = match capability.availability {
            Availability::Available => (true, None),
            Availability::Unavailable { reason, .. } => (false, Some(reason.as_str().to_owned())),
        };
        let backends = recognition_backends();
        assert_eq!(backends.len(), 2);
        assert_eq!(
            backends[0],
            BackendCapability {
                id: "apple-speech".to_owned(),
                available,
                unavailable_reason,
            }
        );
        assert_eq!(backends[1].id, "whisper");
    }

    #[test]
    fn result_mapping_preserves_structured_timing_and_confidence() {
        let result = map_transcription_result(TranscriptionResult {
            text: "hello".to_owned(),
            language: Some("en_US".to_owned()),
            backend: BackendId::apple_speech(),
            model: None,
            media_duration: Duration::from_millis(1_000),
            processing_duration: Duration::from_millis(250),
            segments: vec![TranscriptionSegment {
                range: TimeRange::from_millis(0, 500),
                text: "hello".to_owned(),
                confidence: None,
                words: vec![WordTimestamp {
                    range: TimeRange::from_millis(0, 500),
                    text: "hello".to_owned(),
                    confidence: Some(0.875),
                }],
            }],
        });

        assert_eq!(result.backend, "apple-speech");
        assert_eq!(result.media_duration_ms, 1_000.0);
        assert_eq!(result.processing_duration_ms, 250.0);
        assert_eq!(result.segments[0].words[0].confidence, Some(0.875));
    }

    #[test]
    fn task_rejects_invalid_pcm_before_loading_a_backend() {
        let mut task = PcmTranscriptionTask {
            pcm: vec![0, 1, 2],
            options: PcmTranscriptionOptions {
                language: "en-US".to_owned(),
                backend: None,
                model_path: None,
                sample_rate: None,
            },
            cancellation: CancellationToken::new(),
        };
        let error = task.compute().expect_err("invalid PCM must fail");
        assert_eq!(error.status, Status::InvalidArg);
        assert!(error.reason.contains("INVALID_INPUT"));
    }

    #[test]
    fn file_task_rejects_missing_media_before_loading_a_backend() {
        let mut task = FileTranscriptionTask {
            path: std::env::temp_dir().join("cuttledoc-node-definitely-missing.media"),
            options: FileTranscriptionOptions {
                language: "en-US".to_owned(),
                backend: None,
                model_path: None,
                ffmpeg_path: Some("/definitely/missing/ffmpeg".to_owned()),
            },
            cancellation: CancellationToken::new(),
        };
        let error = task.compute().expect_err("missing media must fail");
        assert_eq!(error.status, Status::InvalidArg);
        assert!(error.reason.contains("INVALID_INPUT"));
    }
}
