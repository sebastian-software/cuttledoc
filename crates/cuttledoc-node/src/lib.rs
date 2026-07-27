use std::fmt;
use std::path::PathBuf;
use std::time::Duration;

use cuttledoc::{
    AudioFormat, Availability, BackendId, BackendSelection, CancellationToken, EnhancementOutcome,
    ErrorCode, HostedCredential, HostedTranscriptionOptions, MediaDecodeOptions, ModelId,
    PcmBuffer, TranscribeOptions, TranscriptEnhancementContext, TranscriptEnhancementMode,
    TranscriptionResult, apply_transcript_enhancement, recognition_capabilities,
    text_generation_capabilities, transcribe_file_with_cancellation,
    transcribe_pcm_with_cancellation,
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
    pub model: Option<String>,
    #[napi(js_name = "modelPath")]
    pub model_path: Option<String>,
    #[napi(js_name = "sampleRate")]
    pub sample_rate: Option<u32>,
    pub enhancement: Option<String>,
    #[napi(js_name = "enhancementModelPath")]
    pub enhancement_model_path: Option<String>,
}

#[napi(object)]
#[derive(Clone, Eq, PartialEq)]
pub struct FileTranscriptionOptions {
    pub language: String,
    pub backend: Option<String>,
    pub model: Option<String>,
    #[napi(js_name = "modelPath")]
    pub model_path: Option<String>,
    pub credential: Option<String>,
    #[napi(js_name = "timeoutMs")]
    pub timeout_ms: Option<u32>,
    #[napi(js_name = "ffmpegPath")]
    pub ffmpeg_path: Option<String>,
    pub enhancement: Option<String>,
    #[napi(js_name = "enhancementModelPath")]
    pub enhancement_model_path: Option<String>,
}

impl fmt::Debug for FileTranscriptionOptions {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FileTranscriptionOptions")
            .field("language", &self.language)
            .field("backend", &self.backend)
            .field("model", &self.model)
            .field("model_path", &self.model_path)
            .field(
                "credential",
                &self.credential.as_ref().map(|_| "[REDACTED]"),
            )
            .field("timeout_ms", &self.timeout_ms)
            .field("ffmpeg_path", &self.ffmpeg_path)
            .field("enhancement", &self.enhancement)
            .field("enhancement_model_path", &self.enhancement_model_path)
            .finish()
    }
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
    #[napi(js_name = "rawText")]
    pub raw_text: String,
    pub text: String,
    pub language: Option<String>,
    pub backend: String,
    pub model: Option<String>,
    #[napi(js_name = "mediaDurationMs")]
    pub media_duration_ms: f64,
    #[napi(js_name = "processingDurationMs")]
    pub processing_duration_ms: f64,
    pub segments: Vec<TranscriptSegment>,
    pub enhancement: Option<TranscriptEnhancement>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptEnhancement {
    pub backend: String,
    pub model: String,
    pub outcome: String,
    #[napi(js_name = "fallbackReason")]
    pub fallback_reason: Option<String>,
    #[napi(js_name = "fallbackDetail")]
    pub fallback_detail: Option<String>,
    #[napi(js_name = "promptId")]
    pub prompt_id: String,
    #[napi(js_name = "promptSha256")]
    pub prompt_sha256: String,
    #[napi(js_name = "processingDurationMs")]
    pub processing_duration_ms: f64,
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
            self.options.model.as_deref(),
            self.options.model_path.as_deref(),
            None,
            None,
        )?;
        let result = transcribe_pcm_with_cancellation(&input, &options, &self.cancellation)
            .map_err(node_error)?;
        let result = apply_enhancement_to_result(
            result,
            &self.options.language,
            self.options.enhancement.as_deref(),
            self.options.enhancement_model_path.as_deref(),
            &self.cancellation,
        )?;
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
            self.options.model.as_deref(),
            self.options.model_path.as_deref(),
            self.options.credential.as_deref(),
            self.options.timeout_ms,
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
        let result = apply_enhancement_to_result(
            result,
            &self.options.language,
            self.options.enhancement.as_deref(),
            self.options.enhancement_model_path.as_deref(),
            &self.cancellation,
        )?;
        Ok(map_transcription_result(result))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

fn transcribe_options(
    language: &str,
    backend: Option<&str>,
    model: Option<&str>,
    model_path: Option<&str>,
    credential: Option<&str>,
    timeout_ms: Option<u32>,
) -> Result<TranscribeOptions> {
    let backend = match backend {
        None | Some("auto") => BackendSelection::Auto,
        Some(value) => BackendSelection::Id(
            BackendId::new(value)
                .map_err(|error| Error::new(Status::InvalidArg, error.to_string()))?,
        ),
    };
    if (credential.is_some() || timeout_ms.is_some())
        && !matches!(
            &backend,
            BackendSelection::Id(backend) if backend == &BackendId::openai_transcription()
        )
    {
        return Err(Error::new(
            Status::InvalidArg,
            "credential and timeoutMs require backend: openai-transcription".to_owned(),
        ));
    }
    let model = model
        .map(|value| {
            ModelId::new(value).map_err(|error| Error::new(Status::InvalidArg, error.to_string()))
        })
        .transpose()?;
    let credential = credential
        .map(|value| {
            HostedCredential::new(value).map_err(|_| {
                Error::new(
                    Status::InvalidArg,
                    "hosted transcription credential is missing or invalid".to_owned(),
                )
            })
        })
        .transpose()?;
    let timeout = match timeout_ms {
        Some(0) => {
            return Err(Error::new(
                Status::InvalidArg,
                "timeoutMs must be greater than zero".to_owned(),
            ));
        }
        Some(value) => Duration::from_millis(u64::from(value)),
        None => HostedTranscriptionOptions::default().timeout,
    };
    Ok(TranscribeOptions {
        backend,
        model,
        model_path: model_path.map(PathBuf::from),
        language: Some(language.to_owned()),
        hosted: HostedTranscriptionOptions {
            credential,
            timeout,
        },
    })
}

fn apply_enhancement_to_result(
    result: TranscriptionResult,
    requested_language: &str,
    selection: Option<&str>,
    model_directory: Option<&str>,
    cancellation: &CancellationToken,
) -> Result<TranscriptionResult> {
    let mode = match selection {
        None | Some("off") => TranscriptEnhancementMode::disabled(),
        Some("local") => {
            TranscriptEnhancementMode::gemma_mlx(model_directory.map(PathBuf::from), None)
        }
        Some("gemini") => TranscriptEnhancementMode::gemini_openrouter_from_environment(),
        Some(_) => {
            return Err(Error::new(
                Status::InvalidArg,
                "enhancement must be off, local, or gemini".to_owned(),
            ));
        }
    };
    if model_directory.is_some() && selection != Some("local") {
        return Err(Error::new(
            Status::InvalidArg,
            "enhancementModelPath requires enhancement: local".to_owned(),
        ));
    }
    let locale = result
        .language
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| requested_language.to_owned())
        .replace('_', "-");
    let language = locale
        .split('-')
        .next()
        .filter(|value| !value.is_empty() && *value != "auto")
        .unwrap_or("und");
    apply_transcript_enhancement(
        result,
        mode,
        &TranscriptEnhancementContext::new(language, &locale),
        cancellation,
    )
    .map_err(node_error)
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

#[napi(js_name = "textGenerationBackends")]
pub fn text_generation_backends() -> Vec<BackendCapability> {
    text_generation_capabilities()
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
    let enhancement = result.enhancement.map(|enhancement| {
        let (outcome, fallback_reason, fallback_detail) = match enhancement.outcome {
            EnhancementOutcome::Applied => ("applied".to_owned(), None, None),
            EnhancementOutcome::RawFallback { reason, detail } => (
                "raw_fallback".to_owned(),
                Some(reason.as_str().to_owned()),
                Some(detail),
            ),
        };
        TranscriptEnhancement {
            backend: enhancement.backend.to_string(),
            model: enhancement.model.to_string(),
            outcome,
            fallback_reason,
            fallback_detail,
            prompt_id: enhancement.prompt_id.to_owned(),
            prompt_sha256: enhancement.prompt_sha256.to_owned(),
            processing_duration_ms: duration_milliseconds(enhancement.processing_duration),
        }
    });
    PcmTranscriptionResult {
        raw_text: result.raw_text,
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
        enhancement,
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
        let backends = recognition_backends();
        #[cfg(feature = "local-runtimes")]
        {
            let capability = recognition_capabilities()
                .into_iter()
                .find(|capability| capability.backend.as_str() == "apple-speech")
                .expect("Apple Speech is a known backend");
            let (available, unavailable_reason) = match capability.availability {
                Availability::Available => (true, None),
                Availability::Unavailable { reason, .. } => {
                    (false, Some(reason.as_str().to_owned()))
                }
            };
            assert_eq!(backends.len(), 3);
            assert_eq!(
                backends[0],
                BackendCapability {
                    id: "apple-speech".to_owned(),
                    available,
                    unavailable_reason,
                }
            );
            assert_eq!(backends[1].id, "whisper");
            assert_eq!(backends[2].id, "openai-transcription");
        }
        #[cfg(not(feature = "local-runtimes"))]
        assert_eq!(
            backends
                .iter()
                .map(|backend| backend.id.as_str())
                .collect::<Vec<_>>(),
            vec!["openai-transcription"]
        );
        assert_eq!(
            text_generation_backends()
                .into_iter()
                .map(|backend| backend.id)
                .collect::<Vec<_>>(),
            {
                #[cfg(feature = "local-runtimes")]
                {
                    vec!["gemma-mlx", "openrouter"]
                }
                #[cfg(not(feature = "local-runtimes"))]
                {
                    vec!["openrouter"]
                }
            }
        );
    }

    #[test]
    fn result_mapping_preserves_structured_timing_and_confidence() {
        let result = map_transcription_result(TranscriptionResult {
            raw_text: "hello".to_owned(),
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
            enhancement: None,
        });

        assert_eq!(result.backend, "apple-speech");
        assert_eq!(result.raw_text, "hello");
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
                model: None,
                model_path: None,
                sample_rate: None,
                enhancement: None,
                enhancement_model_path: None,
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
                model: None,
                model_path: None,
                credential: None,
                timeout_ms: None,
                ffmpeg_path: Some("/definitely/missing/ffmpeg".to_owned()),
                enhancement: None,
                enhancement_model_path: None,
            },
            cancellation: CancellationToken::new(),
        };
        let error = task.compute().expect_err("missing media must fail");
        assert_eq!(error.status, Status::InvalidArg);
        assert!(error.reason.contains("INVALID_INPUT"));
    }

    #[test]
    fn hosted_node_options_map_model_credential_and_timeout_without_exposing_the_secret() {
        let secret = "sk-test-secret";
        let js_options = FileTranscriptionOptions {
            language: "en-US".to_owned(),
            backend: Some("openai-transcription".to_owned()),
            model: Some("gpt-4o-mini-transcribe".to_owned()),
            model_path: None,
            credential: Some(secret.to_owned()),
            timeout_ms: Some(45_000),
            ffmpeg_path: None,
            enhancement: None,
            enhancement_model_path: None,
        };
        let debug = format!("{js_options:?}");
        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains(secret));

        let options = transcribe_options(
            &js_options.language,
            js_options.backend.as_deref(),
            js_options.model.as_deref(),
            js_options.model_path.as_deref(),
            js_options.credential.as_deref(),
            js_options.timeout_ms,
        )
        .expect("valid hosted options");
        assert_eq!(
            options.model.as_ref().map(ModelId::as_str),
            Some("gpt-4o-mini-transcribe")
        );
        assert_eq!(options.hosted.timeout, Duration::from_secs(45));
        let core_debug = format!("{options:?}");
        assert!(core_debug.contains("[REDACTED]"));
        assert!(!core_debug.contains(secret));
    }

    #[test]
    fn hosted_node_options_require_explicit_selection_and_positive_timeout() {
        let error = transcribe_options(
            "en-US",
            Some("auto"),
            None,
            None,
            Some("sk-test-secret"),
            None,
        )
        .expect_err("credentials must not influence auto selection");
        assert_eq!(error.status, Status::InvalidArg);

        let error = transcribe_options(
            "en-US",
            Some("openai-transcription"),
            None,
            None,
            None,
            Some(0),
        )
        .expect_err("zero timeout must fail");
        assert_eq!(error.status, Status::InvalidArg);
    }

    #[test]
    fn pre_cancelled_hosted_file_task_never_starts_a_request() {
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        let mut task = FileTranscriptionTask {
            path: PathBuf::from("audio.wav"),
            options: FileTranscriptionOptions {
                language: "en-US".to_owned(),
                backend: Some("openai-transcription".to_owned()),
                model: Some("gpt-4o-transcribe".to_owned()),
                model_path: None,
                credential: Some("sk-test-secret".to_owned()),
                timeout_ms: Some(1_000),
                ffmpeg_path: None,
                enhancement: None,
                enhancement_model_path: None,
            },
            cancellation,
        };

        let error = task.compute().expect_err("cancelled task must fail");
        assert_eq!(error.status, Status::Cancelled);
        assert!(!error.reason.contains("sk-test-secret"));
    }
}
