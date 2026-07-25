use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::{
    AudioFormat, CancellationToken, PcmBuffer, Result, TranscribeOptions, TranscriptionResult,
    transcribe_pcm_with_cancellation,
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
    let started_at = Instant::now();
    let decoded = cuttledoc_audio::decode_file(
        path.as_ref(),
        &cuttledoc_audio::DecodeOptions {
            ffmpeg_path: decode_options.ffmpeg_path.clone(),
        },
        || cancellation.is_cancelled(),
    )?;
    let format = AudioFormat::new(decoded.sample_rate, decoded.channels)?;
    let input = PcmBuffer::new(format, decoded.samples)?;
    let mut result = transcribe_pcm_with_cancellation(&input, options, cancellation)?;
    result.processing_duration = started_at.elapsed();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use crate::ErrorCode;

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
        assert_eq!(error.code, ErrorCode::InvalidInput);
        assert!(error.message.contains("could not read media input"));
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
}
