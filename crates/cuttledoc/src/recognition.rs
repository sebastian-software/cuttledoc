use std::thread;
use std::time::{Duration, Instant};

use cuttledoc_apple_speech::{
    NativeSegment, NativeStability, NativeTimeRange, NativeTranscriptionUpdate, NativeUpdateKind,
    PushOutcome, SpeechSession,
};

use crate::{
    BackendId, BackendSelection, CancellationToken, CuttledocError, ErrorCode, ModelId, PcmBuffer,
    Result, Stability, TimeRange, TranscribeOptions, TranscriptReducer, TranscriptionResult,
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
    let backend = select_backend(options)?;
    ensure_not_cancelled(cancellation, &backend)?;

    if backend == BackendId::apple_speech() {
        return transcribe_apple_speech(input, options, cancellation, backend);
    }
    if backend == BackendId::whisper() {
        return transcribe_whisper(input, options, cancellation, backend);
    }
    Err(CuttledocError::new(
        ErrorCode::BackendUnavailable,
        format!("recognition backend {backend} is not implemented"),
    )
    .with_backend(backend))
}

fn transcribe_apple_speech(
    input: &PcmBuffer,
    options: &TranscribeOptions,
    cancellation: &CancellationToken,
    backend: BackendId,
) -> Result<TranscriptionResult> {
    validate_apple_request(input, options, &backend)?;
    let started_at = Instant::now();
    let requested_locale = options
        .language
        .as_deref()
        .expect("request validation requires an explicit language");
    let mut session = SpeechSession::create(requested_locale, input.format.sample_rate)
        .map_err(CuttledocError::from)?;
    let resolved_locale = session.resolved_locale().map(str::to_owned);
    let mut accumulator = UpdateAccumulator::default();
    let chunk_size = input_chunk_size(input.format.sample_rate);

    for chunk in input.samples.chunks(chunk_size) {
        loop {
            if cancellation.is_cancelled() {
                session.cancel();
                return Err(cancelled_error(&backend));
            }
            match session.push(chunk).map_err(CuttledocError::from)? {
                PushOutcome::Accepted => break,
                PushOutcome::WouldBlock => thread::sleep(BACKPRESSURE_RETRY_DELAY),
            }
        }
        accumulator.apply(
            session.take_updates().map_err(CuttledocError::from)?,
            &backend,
        )?;
    }

    if cancellation.is_cancelled() {
        session.cancel();
        return Err(cancelled_error(&backend));
    }
    accumulator.apply(session.finish().map_err(CuttledocError::from)?, &backend)?;
    session.close();

    if accumulator.saw_replace && !accumulator.saw_final {
        return Err(contract_error(
            &backend,
            "Apple Speech completed after emitting replacements but no final update",
        ));
    }

    let text = accumulator.reducer.final_text();
    Ok(TranscriptionResult {
        raw_text: text.clone(),
        text,
        language: resolved_locale,
        backend,
        model: None,
        media_duration: media_duration(input),
        processing_duration: started_at.elapsed(),
        segments: accumulator.reducer.final_segments(),
        enhancement: None,
    })
}

fn transcribe_whisper(
    input: &PcmBuffer,
    options: &TranscribeOptions,
    cancellation: &CancellationToken,
    backend: BackendId,
) -> Result<TranscriptionResult> {
    validate_whisper_request(input, options, &backend)?;
    let model =
        ModelId::new(cuttledoc_whisper::MODEL_ID).expect("the built-in Whisper model ID is valid");
    let model_path = options
        .model_path
        .clone()
        .or_else(cuttledoc_whisper::configured_model_path)
        .ok_or_else(|| {
            CuttledocError::new(
                ErrorCode::ModelMissing,
                format!(
                    "Whisper large-v3-turbo is not installed; set {} or pass an explicit model path",
                    cuttledoc_whisper::MODEL_PATH_ENV
                ),
            )
            .with_backend(backend.clone())
            .with_model(model.clone())
        })?;
    let language = whisper_language(options.language.as_deref(), &backend)?;

    let started_at = Instant::now();
    let mut engine = cuttledoc_whisper::WhisperEngine::create(&cuttledoc_whisper::EngineOptions {
        model_path,
        language,
        threads: 4,
    })
    .map_err(CuttledocError::from)?;
    let native = engine
        .transcribe(&input.samples, || cancellation.is_cancelled())
        .map_err(CuttledocError::from)?;
    ensure_not_cancelled(cancellation, &backend)?;

    let media_duration = media_duration(input);
    let media_end_ms = u64::try_from(media_duration.as_millis()).unwrap_or(u64::MAX);
    let mut previous_end = None;
    let mut segments = Vec::with_capacity(native.segments.len());
    for segment in native.segments {
        let start_ms = segment.range.start_ms.min(media_end_ms);
        let end_ms = segment.range.end_ms.min(media_end_ms);
        if start_ms >= end_ms || previous_end.is_some_and(|end| end > start_ms) {
            return Err(contract_error(
                &backend,
                "Whisper emitted invalid or overlapping segment ranges",
            ));
        }
        previous_end = Some(end_ms);
        segments.push(TranscriptionSegment {
            range: TimeRange::from_millis(start_ms, end_ms),
            text: segment.text,
            confidence: None,
            words: Vec::new(),
        });
    }
    let text = segments
        .iter()
        .map(|segment| segment.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    Ok(TranscriptionResult {
        raw_text: text.clone(),
        text,
        language: native.language,
        backend,
        model: Some(model),
        media_duration,
        processing_duration: started_at.elapsed(),
        segments,
        enhancement: None,
    })
}

fn select_backend(options: &TranscribeOptions) -> Result<BackendId> {
    let apple = BackendId::apple_speech();
    let whisper = BackendId::whisper();
    match &options.backend {
        BackendSelection::Auto => {
            let capabilities = crate::recognition_capabilities();
            if options.language.as_deref().is_some_and(|language| {
                capabilities.iter().any(|capability| {
                    capability.backend == apple
                        && capability.availability.is_available()
                        && apple_supports_language(capability, language)
                })
            }) {
                return Ok(apple);
            }
            if capabilities.iter().any(|capability| {
                capability.backend == whisper
                    && (capability.availability.is_available()
                        || explicit_whisper_model_is_available(options))
            }) {
                return Ok(whisper);
            }
            Err(CuttledocError::new(
                ErrorCode::BackendUnavailable,
                "no local recognition backend is available for this request",
            ))
        }
        BackendSelection::Id(backend) if backend == &apple => Ok(backend.clone()),
        BackendSelection::Id(backend) if backend == &whisper => Ok(backend.clone()),
        BackendSelection::Id(backend) => Err(CuttledocError::new(
            ErrorCode::BackendUnavailable,
            format!("recognition backend {backend} is not implemented"),
        )
        .with_backend(backend.clone())),
    }
}

fn apple_supports_language(capability: &crate::RecognitionCapabilities, requested: &str) -> bool {
    let requested = requested.to_ascii_lowercase().replace('_', "-");
    if requested.is_empty() {
        return false;
    }
    if requested.contains('-') {
        return capability
            .locales
            .iter()
            .any(|locale| locale.to_ascii_lowercase().replace('_', "-") == requested);
    }
    capability
        .languages
        .iter()
        .any(|language| language == &requested)
}

fn explicit_whisper_model_is_available(options: &TranscribeOptions) -> bool {
    cuttledoc_whisper::build_support() == cuttledoc_whisper::BuildSupport::Native
        && options
            .model_path
            .as_deref()
            .is_some_and(|path| cuttledoc_whisper::validate_model(path).is_ok())
}

fn validate_apple_request(
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
    if options.model_path.is_some() {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "Apple Speech uses system-managed assets and does not accept a model path",
        )
        .with_backend(backend.clone()));
    }
    Ok(())
}

fn validate_whisper_request(
    input: &PcmBuffer,
    options: &TranscribeOptions,
    backend: &BackendId,
) -> Result<()> {
    if input.format.channels != 1 || input.format.sample_rate != 16_000 {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "Whisper requires mono 16000 Hz PCM input",
        )
        .with_backend(backend.clone()));
    }
    if let Some(model) = &options.model
        && model.as_str() != cuttledoc_whisper::MODEL_ID
    {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            format!("Whisper supports only {}", cuttledoc_whisper::MODEL_ID),
        )
        .with_backend(backend.clone())
        .with_model(model.clone()));
    }
    Ok(())
}

fn whisper_language(language: Option<&str>, backend: &BackendId) -> Result<Option<String>> {
    let Some(language) = language.filter(|value| !value.is_empty() && *value != "auto") else {
        return Ok(None);
    };
    let language = language
        .split(['-', '_'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !cuttledoc_whisper::SUPPORTED_LANGUAGES.contains(&language.as_str()) {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            format!("Whisper does not support language {language}"),
        )
        .with_backend(backend.clone()));
    }
    Ok(Some(language))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AudioFormat, Availability, CancellationBoundary, ModelId, RecognitionCapabilities,
    };

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
            validate_apple_request(&stereo, &options, &backend)
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
            validate_apple_request(&mono, &options, &backend)
                .expect_err("missing language must fail")
                .code,
            ErrorCode::InvalidInput
        );

        options.language = Some("en-US".to_owned());
        options.model = Some(ModelId::new("custom").expect("valid model"));
        assert_eq!(
            validate_apple_request(&mono, &options, &backend)
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

    #[test]
    fn explicit_whisper_selection_is_independent_of_model_availability() {
        let options = TranscribeOptions {
            backend: BackendSelection::Id(BackendId::whisper()),
            language: Some("en-US".to_owned()),
            ..TranscribeOptions::default()
        };
        assert_eq!(
            select_backend(&options).expect("explicit backend"),
            BackendId::whisper()
        );
    }

    #[test]
    fn apple_auto_selection_requires_an_exact_regional_locale() {
        let capability = RecognitionCapabilities {
            backend: BackendId::apple_speech(),
            model: None,
            availability: Availability::Available,
            file_input: false,
            bounded_pcm_input: true,
            streaming_pcm_input: true,
            dynamic_locales: true,
            languages: vec!["en".to_owned()],
            locales: vec!["en_GB".to_owned()],
            segment_timestamps: true,
            word_timestamps: true,
            confidence: true,
            incremental_finals: true,
            volatile_results: true,
            max_concurrent_requests: 1,
            cancellation_boundary: CancellationBoundary::InputChunk,
        };

        assert!(apple_supports_language(&capability, "en"));
        assert!(apple_supports_language(&capability, "en-GB"));
        assert!(!apple_supports_language(&capability, "en-US"));
    }

    #[test]
    fn explicit_model_availability_reflects_native_build_support() {
        let temporary_root = std::env::temp_dir().join(format!(
            "cuttledoc-whisper-selection-{}",
            std::process::id()
        ));
        let model_path = temporary_root.join("ggml-large-v3-turbo.bin");
        let encoder_path = temporary_root.join("ggml-large-v3-turbo-encoder.mlmodelc");
        std::fs::create_dir_all(&encoder_path).expect("temporary encoder directory");
        std::fs::write(&model_path, b"placeholder").expect("temporary model file");
        let options = TranscribeOptions {
            model_path: Some(model_path),
            ..TranscribeOptions::default()
        };

        assert_eq!(
            explicit_whisper_model_is_available(&options),
            cuttledoc_whisper::build_support() == cuttledoc_whisper::BuildSupport::Native
        );

        std::fs::remove_dir_all(temporary_root).expect("remove temporary model pair");
    }

    #[test]
    fn whisper_languages_normalize_bcp47_and_preserve_auto_detection() {
        let backend = BackendId::whisper();
        assert_eq!(
            whisper_language(Some("pt-BR"), &backend).expect("supported language"),
            Some("pt".to_owned())
        );
        assert_eq!(
            whisper_language(Some("auto"), &backend).expect("auto detection"),
            None
        );
        assert_eq!(
            whisper_language(None, &backend).expect("auto detection"),
            None
        );
        assert_eq!(
            whisper_language(Some("invalid"), &backend)
                .expect_err("unknown language")
                .code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn whisper_validation_requires_normalized_pcm_and_the_pinned_model() {
        let backend = BackendId::whisper();
        let input = PcmBuffer::new(
            AudioFormat::new(16_000, 1).expect("valid format"),
            vec![0.0],
        )
        .expect("valid buffer");
        validate_whisper_request(&input, &TranscribeOptions::default(), &backend)
            .expect("default model");

        let options = TranscribeOptions {
            model: Some(ModelId::new("another-model").expect("valid ID")),
            ..TranscribeOptions::default()
        };
        assert_eq!(
            validate_whisper_request(&input, &options, &backend)
                .expect_err("wrong model")
                .code,
            ErrorCode::InvalidInput
        );

        let wrong_rate = PcmBuffer::new(
            AudioFormat::new(48_000, 1).expect("valid format"),
            vec![0.0],
        )
        .expect("valid buffer");
        assert_eq!(
            validate_whisper_request(&wrong_rate, &TranscribeOptions::default(), &backend)
                .expect_err("wrong sample rate")
                .code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn missing_whisper_model_has_a_stable_product_error() {
        let input = PcmBuffer::new(
            AudioFormat::new(16_000, 1).expect("valid format"),
            vec![0.0],
        )
        .expect("valid buffer");
        let options = TranscribeOptions {
            backend: BackendSelection::Id(BackendId::whisper()),
            model_path: Some(std::env::temp_dir().join(format!(
                "cuttledoc-definitely-missing-whisper-model-{}/model.bin",
                std::process::id()
            ))),
            ..TranscribeOptions::default()
        };

        let error = transcribe_pcm(&input, &options).expect_err("missing model must fail");
        assert_eq!(error.code, ErrorCode::ModelMissing);
        assert_eq!(error.backend, Some(BackendId::whisper()));
        assert_eq!(
            error.model,
            Some(ModelId::new(cuttledoc_whisper::MODEL_ID).expect("valid model ID"))
        );
    }
}
