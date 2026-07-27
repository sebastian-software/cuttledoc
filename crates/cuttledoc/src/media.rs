use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::recognition::{is_explicit_hosted_file_request, transcribe_openai_file_with_progress};
use crate::{
    AudioFormat, CancellationToken, PcmBuffer, ProgressEvent, ProgressPhase, Result,
    TranscribeOptions, TranscriptionResult, transcribe_pcm_with_progress,
};

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct MediaDecodeOptions {
    pub ffmpeg_path: Option<PathBuf>,
}

pub fn transcribe_file(
    path: impl AsRef<Path>,
    options: &TranscribeOptions,
    decode_options: &MediaDecodeOptions,
) -> Result<TranscriptionResult> {
    transcribe_file_with_cancellation(path, options, decode_options, &CancellationToken::new())
}

pub fn transcribe_file_with_cancellation(
    path: impl AsRef<Path>,
    options: &TranscribeOptions,
    decode_options: &MediaDecodeOptions,
    cancellation: &CancellationToken,
) -> Result<TranscriptionResult> {
    transcribe_file_with_progress(path, options, decode_options, cancellation, |_| {})
}

pub fn transcribe_file_with_progress(
    path: impl AsRef<Path>,
    options: &TranscribeOptions,
    decode_options: &MediaDecodeOptions,
    cancellation: &CancellationToken,
    mut on_progress: impl FnMut(ProgressEvent),
) -> Result<TranscriptionResult> {
    let started_at = Instant::now();
    on_progress(ProgressEvent {
        phase: ProgressPhase::Preparing,
        completed: 0,
        total: Some(1),
        message: None,
    });
    if is_explicit_hosted_file_request(options) {
        on_progress(ProgressEvent {
            phase: ProgressPhase::Preparing,
            completed: 1,
            total: Some(1),
            message: None,
        });
        let mut result = transcribe_openai_file_with_progress(
            path.as_ref(),
            options,
            cancellation,
            &mut on_progress,
        )?;
        result.processing_duration = started_at.elapsed();
        return Ok(result);
    }
    on_progress(ProgressEvent {
        phase: ProgressPhase::Decoding,
        completed: 0,
        total: Some(1),
        message: None,
    });
    let decoded = cuttledoc_audio::decode_file(
        path.as_ref(),
        &cuttledoc_audio::DecodeOptions {
            ffmpeg_path: decode_options.ffmpeg_path.clone(),
        },
        || cancellation.is_cancelled(),
    )?;
    on_progress(ProgressEvent {
        phase: ProgressPhase::Decoding,
        completed: 1,
        total: Some(1),
        message: None,
    });
    let format = AudioFormat::new(decoded.sample_rate, decoded.channels)?;
    let input = PcmBuffer::new(format, decoded.samples)?;
    on_progress(ProgressEvent {
        phase: ProgressPhase::Preparing,
        completed: 1,
        total: Some(1),
        message: None,
    });
    let mut result = transcribe_pcm_with_progress(&input, options, cancellation, on_progress)?;
    result.processing_duration = started_at.elapsed();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use crate::{
        BackendId, BackendSelection, ErrorCode, HostedCredential, HostedTranscriptionOptions,
    };

    use super::*;

    fn options() -> TranscribeOptions {
        TranscribeOptions {
            language: Some("en-US".to_owned()),
            ..TranscribeOptions::default()
        }
    }

    #[test]
    fn missing_media_is_rejected_before_backend_selection() {
        let path = std::env::temp_dir().join("cuttledoc-definitely-missing.media");
        let error = transcribe_file(
            path,
            &options(),
            &MediaDecodeOptions {
                ffmpeg_path: Some(PathBuf::from("/definitely/missing/ffmpeg")),
            },
        )
        .expect_err("missing media must fail");
        assert_eq!(error.code, ErrorCode::InvalidInput, "{error:?}");
        assert!(error.message.contains("could not read media input"));
    }

    #[test]
    fn file_progress_reports_preparation_and_decode_boundary_before_failure() {
        let path = std::env::temp_dir().join("cuttledoc-definitely-missing-progress.media");
        let mut events = Vec::new();
        let error = transcribe_file_with_progress(
            path,
            &options(),
            &MediaDecodeOptions::default(),
            &CancellationToken::new(),
            |event| events.push(event),
        )
        .expect_err("missing media must fail");
        assert_eq!(error.code, ErrorCode::InvalidInput, "{error:?}");
        assert_eq!(
            events
                .iter()
                .map(|event| (event.phase, event.completed, event.total))
                .collect::<Vec<_>>(),
            vec![
                (ProgressPhase::Preparing, 0, Some(1)),
                (ProgressPhase::Decoding, 0, Some(1)),
            ]
        );
    }

    #[test]
    fn missing_ffmpeg_maps_to_the_stable_decode_error() {
        let input = std::env::current_exe().expect("current test executable");
        let error = transcribe_file(
            input,
            &options(),
            &MediaDecodeOptions {
                ffmpeg_path: Some(PathBuf::from("/definitely/missing/ffmpeg")),
            },
        )
        .expect_err("missing FFmpeg must fail");
        assert_eq!(error.code, ErrorCode::AudioDecodeFailed);
        assert!(
            error
                .message
                .contains("configure --ffmpeg-path or FFMPEG_PATH")
        );
    }

    #[test]
    fn pre_cancelled_file_work_never_starts_ffmpeg() {
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        let input = std::env::current_exe().expect("current test executable");
        let error = transcribe_file_with_cancellation(
            input,
            &options(),
            &MediaDecodeOptions {
                ffmpeg_path: Some(PathBuf::from("/definitely/missing/ffmpeg")),
            },
            &cancellation,
        )
        .expect_err("cancelled work must fail");
        assert_eq!(error.code, ErrorCode::Cancelled);
    }

    #[test]
    fn explicit_hosted_file_bypasses_ffmpeg_and_keeps_the_original_input_boundary() {
        let path =
            std::env::temp_dir().join("cuttledoc-definitely-missing-hosted-transcription.media");
        let options = TranscribeOptions {
            backend: BackendSelection::Id(BackendId::openai_transcription()),
            hosted: HostedTranscriptionOptions {
                credential: Some(
                    HostedCredential::new("sk-test-secret").expect("valid credential"),
                ),
                ..HostedTranscriptionOptions::default()
            },
            ..TranscribeOptions::default()
        };
        let mut events = Vec::new();

        let error = transcribe_file_with_progress(
            path,
            &options,
            &MediaDecodeOptions {
                ffmpeg_path: Some(PathBuf::from("/definitely/missing/ffmpeg")),
            },
            &CancellationToken::new(),
            |event| events.push(event),
        )
        .expect_err("missing hosted input must fail");

        assert_eq!(error.code, ErrorCode::InvalidInput, "{error:?}");
        assert_eq!(error.backend, Some(BackendId::openai_transcription()));
        assert!(
            events
                .iter()
                .all(|event| event.phase != ProgressPhase::Decoding)
        );
        assert_eq!(
            events
                .iter()
                .map(|event| (event.phase, event.completed, event.total))
                .collect::<Vec<_>>(),
            vec![
                (ProgressPhase::Preparing, 0, Some(1)),
                (ProgressPhase::Preparing, 1, Some(1)),
                (ProgressPhase::Transcribing, 0, Some(1)),
            ]
        );
    }
}
