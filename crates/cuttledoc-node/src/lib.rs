use cuttledoc::{
    AudioFormat, Availability, CancellationToken, ErrorCode, PcmBuffer, TranscribeOptions,
    TranscriptionResult, recognition_capabilities, transcribe_pcm_with_cancellation,
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
    #[napi(js_name = "sampleRate")]
    pub sample_rate: Option<u32>,
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

impl Task for PcmTranscriptionTask {
    type Output = PcmTranscriptionResult;
    type JsValue = PcmTranscriptionResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let format =
            AudioFormat::new(self.options.sample_rate.unwrap_or(16_000), 1).map_err(node_error)?;
        let input = PcmBuffer::from_f32le_bytes(format, &self.pcm).map_err(node_error)?;
        let result = transcribe_pcm_with_cancellation(
            &input,
            &TranscribeOptions {
                language: Some(self.options.language.clone()),
                ..TranscribeOptions::default()
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
    let cancellation = CancellationToken::new();
    if let Some(abort_signal) = signal.as_ref() {
        let cancellation_on_abort = cancellation.clone();
        abort_signal.on_abort(move || cancellation_on_abort.cancel());
    }
    AsyncTask::with_optional_signal(
        PcmTranscriptionTask {
            pcm: pcm.as_ref().to_vec(),
            options,
            cancellation,
        },
        signal,
    )
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
        assert_eq!(
            recognition_backends(),
            vec![BackendCapability {
                id: "apple-speech".to_owned(),
                available,
                unavailable_reason,
            }]
        );
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
                sample_rate: None,
            },
            cancellation: CancellationToken::new(),
        };
        let error = task.compute().expect_err("invalid PCM must fail");
        assert_eq!(error.status, Status::InvalidArg);
        assert!(error.reason.contains("INVALID_INPUT"));
    }
}
