use std::thread;
use std::time::{Duration, Instant};

use cuttledoc_apple_speech::{
    AdapterError, AdapterErrorKind, NativeSegment, NativeStability, NativeTimeRange,
    NativeTranscriptionUpdate, NativeUpdateKind, PushOutcome, SpeechSession,
};

use crate::{
    BackendId, BackendSelection, CancellationToken, CuttledocError, ErrorCode, PcmBuffer, Result,
    Stability, TimeRange, TranscribeOptions, TranscriptReducer, TranscriptionResult,
    TranscriptionSegment, TranscriptionUpdate, TranscriptionUpdateKind, WordTimestamp,
};

const INPUT_CHUNK_DURATION_MS: u32 = 200;
const BACKPRESSURE_RETRY_DELAY: Duration = Duration::from_millis(2);

pub fn transcribe_pcm(
    input: &PcmBuffer,
    options: &TranscribeOptions,
) -> Result<TranscriptionResult> {
    transcribe_pcm_with_cancellation(input, options, &CancellationToken::new())
}

pub fn transcribe_pcm_with_cancellation(
    input: &PcmBuffer,
    options: &TranscribeOptions,
    cancellation: &CancellationToken,
) -> Result<TranscriptionResult> {
    let backend = select_backend(&options.backend)?;
    validate_request(input, options, &backend)?;
    ensure_not_cancelled(cancellation, &backend)?;

    let started_at = Instant::now();
    let requested_locale = options
        .language
        .as_deref()
        .expect("request validation requires an explicit language");
    let mut session = SpeechSession::create(requested_locale, input.format.sample_rate)
        .map_err(|error| map_adapter_error(error, &backend))?;
    let resolved_locale = session.resolved_locale().map(str::to_owned);
    let mut accumulator = UpdateAccumulator::default();
    let chunk_size = input_chunk_size(input.format.sample_rate);

    for chunk in input.samples.chunks(chunk_size) {
        loop {
            if cancellation.is_cancelled() {
                session.cancel();
                return Err(cancelled_error(&backend));
            }
            match session
                .push(chunk)
                .map_err(|error| map_adapter_error(error, &backend))?
            {
                PushOutcome::Accepted => break,
                PushOutcome::WouldBlock => thread::sleep(BACKPRESSURE_RETRY_DELAY),
            }
        }
        accumulator.apply(
            session
                .take_updates()
                .map_err(|error| map_adapter_error(error, &backend))?,
            &backend,
        )?;
    }

    if cancellation.is_cancelled() {
        session.cancel();
        return Err(cancelled_error(&backend));
    }
    accumulator.apply(
        session
            .finish()
            .map_err(|error| map_adapter_error(error, &backend))?,
        &backend,
    )?;
    session.close();

    if accumulator.saw_replace && !accumulator.saw_final {
        return Err(contract_error(
            &backend,
            "Apple Speech completed after emitting replacements but no final update",
        ));
    }

    Ok(TranscriptionResult {
        text: accumulator.reducer.final_text(),
        language: resolved_locale,
        backend,
        model: None,
        media_duration: media_duration(input),
        processing_duration: started_at.elapsed(),
        segments: accumulator.reducer.final_segments(),
    })
}

fn select_backend(selection: &BackendSelection) -> Result<BackendId> {
    let apple = BackendId::apple_speech();
    match selection {
        BackendSelection::Auto => Ok(apple),
        BackendSelection::Id(backend) if backend == &apple => Ok(backend.clone()),
        BackendSelection::Id(backend) => Err(CuttledocError::new(
            ErrorCode::BackendUnavailable,
            format!("recognition backend {backend} is not implemented"),
        )
        .with_backend(backend.clone())),
    }
}

fn validate_request(
    input: &PcmBuffer,
    options: &TranscribeOptions,
    backend: &BackendId,
) -> Result<()> {
    if input.format.channels != 1 {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "Apple Speech requires mono PCM input",
        )
        .with_backend(backend.clone()));
    }
    if options.language.as_deref().is_none_or(str::is_empty) {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "Apple Speech requires an explicit BCP 47 language tag",
        )
        .with_backend(backend.clone()));
    }
    if let Some(model) = &options.model {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "Apple Speech uses system-managed assets and does not accept a model selection",
        )
        .with_backend(backend.clone())
        .with_model(model.clone()));
    }
    Ok(())
}

fn ensure_not_cancelled(cancellation: &CancellationToken, backend: &BackendId) -> Result<()> {
    if cancellation.is_cancelled() {
        return Err(cancelled_error(backend));
    }
    Ok(())
}

fn cancelled_error(backend: &BackendId) -> CuttledocError {
    CuttledocError::new(ErrorCode::Cancelled, "transcription was cancelled")
        .with_backend(backend.clone())
}

fn input_chunk_size(sample_rate: u32) -> usize {
    let frames = (u64::from(sample_rate) * u64::from(INPUT_CHUNK_DURATION_MS) / 1_000).max(1);
    usize::try_from(frames).unwrap_or(usize::MAX)
}

fn media_duration(input: &PcmBuffer) -> Duration {
    Duration::from_secs_f64(input.frame_count() as f64 / f64::from(input.format.sample_rate))
}

#[derive(Debug, Default)]
struct UpdateAccumulator {
    reducer: TranscriptReducer,
    volatile_ranges: Vec<TimeRange>,
    saw_replace: bool,
    saw_final: bool,
}

impl UpdateAccumulator {
    fn apply(
        &mut self,
        updates: Vec<NativeTranscriptionUpdate>,
        backend: &BackendId,
    ) -> Result<()> {
        for update in updates {
            let native_range = map_range(update.affected_range);
            let affected_range = self.expanded_affected_range(native_range);
            let stability = match &update.kind {
                NativeUpdateKind::Replace { stability, .. } => Some(*stability),
                NativeUpdateKind::Revoke => None,
            };
            self.reducer
                .apply(map_native_update(update, affected_range, backend)?)
                .map_err(CuttledocError::from)
                .map_err(|error| error.with_backend(backend.clone()))?;
            self.volatile_ranges
                .retain(|range| !range.overlaps(affected_range));
            if stability == Some(NativeStability::Volatile) {
                self.volatile_ranges.push(native_range);
            }
            self.saw_replace |= stability.is_some();
            self.saw_final |= stability == Some(NativeStability::Final);
        }
        Ok(())
    }

    fn expanded_affected_range(&self, native_range: TimeRange) -> TimeRange {
        let mut expanded = native_range;
        loop {
            let previous = expanded;
            for range in &self.volatile_ranges {
                if range.overlaps(expanded) {
                    expanded.start = expanded.start.min(range.start);
                    expanded.end = expanded.end.max(range.end);
                }
            }
            if expanded == previous {
                return expanded;
            }
        }
    }
}

fn map_native_update(
    update: NativeTranscriptionUpdate,
    affected_range: TimeRange,
    backend: &BackendId,
) -> Result<TranscriptionUpdate> {
    let native_range = map_range(update.affected_range);
    let kind = match update.kind {
        NativeUpdateKind::Revoke => TranscriptionUpdateKind::Revoke,
        NativeUpdateKind::Replace {
            segments,
            stability,
        } => {
            let words = map_words(segments, native_range, backend)?;
            TranscriptionUpdateKind::Replace {
                segments: vec![TranscriptionSegment {
                    range: native_range,
                    text: update.text,
                    confidence: None,
                    words,
                }],
                stability: match stability {
                    NativeStability::Volatile => Stability::Volatile,
                    NativeStability::Final => Stability::Final,
                },
            }
        }
    };
    Ok(TranscriptionUpdate {
        sequence: update.sequence,
        affected_range,
        kind,
    })
}

fn map_words(
    segments: Vec<NativeSegment>,
    affected_range: TimeRange,
    backend: &BackendId,
) -> Result<Vec<WordTimestamp>> {
    let mut words = Vec::with_capacity(segments.len());
    let mut previous_range = None;
    for segment in segments {
        let range = map_range(segment.range);
        if !range.is_valid() || !affected_range.contains(range) {
            return Err(contract_error(
                backend,
                "Apple Speech emitted a word outside the affected update range",
            ));
        }
        if previous_range.is_some_and(|previous: TimeRange| {
            range.start < previous.start || previous.overlaps(range)
        }) {
            return Err(contract_error(
                backend,
                "Apple Speech emitted unordered or overlapping word ranges",
            ));
        }
        if segment
            .confidence
            .is_some_and(|confidence| !confidence.is_finite() || !(0.0..=1.0).contains(&confidence))
        {
            return Err(contract_error(
                backend,
                "Apple Speech emitted an invalid word confidence",
            ));
        }
        previous_range = Some(range);
        words.push(WordTimestamp {
            range,
            text: segment.text,
            confidence: segment.confidence,
        });
    }
    Ok(words)
}

fn map_range(range: NativeTimeRange) -> TimeRange {
    TimeRange::from_millis(range.start_ms, range.end_ms)
}

fn contract_error(backend: &BackendId, message: &str) -> CuttledocError {
    CuttledocError::new(ErrorCode::BackendContractViolation, message).with_backend(backend.clone())
}

fn map_adapter_error(error: AdapterError, backend: &BackendId) -> CuttledocError {
    let code = match error.kind {
        AdapterErrorKind::UnsupportedPlatform => ErrorCode::UnsupportedPlatform,
        AdapterErrorKind::InvalidInput => ErrorCode::InvalidInput,
        AdapterErrorKind::SessionCreateFailed => ErrorCode::EngineLoadFailed,
        AdapterErrorKind::NativeFailure => ErrorCode::TranscriptionFailed,
        AdapterErrorKind::SessionClosed => ErrorCode::EngineClosed,
        AdapterErrorKind::CallbackViolation => ErrorCode::BackendContractViolation,
    };
    CuttledocError::new(code, error.message).with_backend(backend.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AudioFormat, ModelId};

    fn native_final() -> NativeTranscriptionUpdate {
        NativeTranscriptionUpdate {
            sequence: 1,
            affected_range: NativeTimeRange {
                start_ms: 0,
                end_ms: 500,
            },
            text: "hello".to_owned(),
            kind: NativeUpdateKind::Replace {
                segments: vec![NativeSegment {
                    range: NativeTimeRange {
                        start_ms: 0,
                        end_ms: 500,
                    },
                    text: "hello".to_owned(),
                    confidence: Some(0.875),
                }],
                stability: NativeStability::Final,
            },
        }
    }

    #[test]
    fn native_result_maps_to_one_segment_with_word_timestamps() {
        let backend = BackendId::apple_speech();
        let update = map_native_update(native_final(), TimeRange::from_millis(0, 500), &backend)
            .expect("valid native update");
        let TranscriptionUpdateKind::Replace {
            segments,
            stability,
        } = update.kind
        else {
            panic!("expected replacement");
        };
        assert_eq!(stability, Stability::Final);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].text, "hello");
        assert_eq!(segments[0].words.len(), 1);
        assert_eq!(segments[0].words[0].confidence, Some(0.875));
    }

    #[test]
    fn invalid_native_word_ranges_fail_at_the_backend_boundary() {
        let backend = BackendId::apple_speech();
        let mut update = native_final();
        let NativeUpdateKind::Replace { segments, .. } = &mut update.kind else {
            panic!("expected replacement");
        };
        segments[0].range.end_ms = 600;
        let error = map_native_update(update, TimeRange::from_millis(0, 500), &backend)
            .expect_err("invalid word must fail");
        assert_eq!(error.code, ErrorCode::BackendContractViolation);
        assert_eq!(error.backend, Some(backend));
    }

    #[test]
    fn narrower_final_replaces_the_complete_volatile_hypothesis() {
        let backend = BackendId::apple_speech();
        let mut accumulator = UpdateAccumulator::default();
        let mut volatile = native_final();
        volatile.affected_range.end_ms = 1_000;
        volatile.text = "hello world".to_owned();
        volatile.kind = NativeUpdateKind::Replace {
            segments: vec![NativeSegment {
                range: volatile.affected_range,
                text: volatile.text.clone(),
                confidence: None,
            }],
            stability: NativeStability::Volatile,
        };
        let mut final_update = native_final();
        final_update.sequence = 2;
        accumulator
            .apply(vec![volatile, final_update], &backend)
            .expect("narrow final must replace the wider hypothesis");

        assert_eq!(accumulator.reducer.final_text(), "hello");
        assert_eq!(
            accumulator.reducer.final_segments()[0].range,
            TimeRange::from_millis(0, 500)
        );
        assert!(accumulator.volatile_ranges.is_empty());
    }

    #[test]
    fn request_validation_requires_mono_language_and_system_assets() {
        let backend = BackendId::apple_speech();
        let stereo = PcmBuffer::new(
            AudioFormat::new(16_000, 2).expect("valid format"),
            vec![0.0, 0.0],
        )
        .expect("valid stereo buffer");
        let mut options = TranscribeOptions {
            language: Some("en-US".to_owned()),
            ..TranscribeOptions::default()
        };
        assert_eq!(
            validate_request(&stereo, &options, &backend)
                .expect_err("stereo must fail")
                .code,
            ErrorCode::InvalidInput
        );

        let mono = PcmBuffer::new(
            AudioFormat::new(16_000, 1).expect("valid format"),
            vec![0.0],
        )
        .expect("valid mono buffer");
        options.language = None;
        assert_eq!(
            validate_request(&mono, &options, &backend)
                .expect_err("missing language must fail")
                .code,
            ErrorCode::InvalidInput
        );

        options.language = Some("en-US".to_owned());
        options.model = Some(ModelId::new("custom").expect("valid model"));
        assert_eq!(
            validate_request(&mono, &options, &backend)
                .expect_err("model selection must fail")
                .code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn cancelled_request_fails_before_loading_the_backend() {
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        let backend = BackendId::apple_speech();
        let error = ensure_not_cancelled(&cancellation, &backend).expect_err("must cancel");
        assert_eq!(error.code, ErrorCode::Cancelled);
        assert_eq!(error.backend, Some(backend));
    }
}
