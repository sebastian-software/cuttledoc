use std::sync::Arc;

use crate::{CuttledocError, ErrorCode, Result};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SampleFormat {
    F32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: SampleFormat,
}

impl AudioFormat {
    pub fn new(sample_rate: u32, channels: u16) -> Result<Self> {
        if sample_rate == 0 {
            return Err(CuttledocError::new(
                ErrorCode::InvalidInput,
                "sample rate must be greater than zero",
            ));
        }
        if channels == 0 {
            return Err(CuttledocError::new(
                ErrorCode::InvalidInput,
                "channel count must be greater than zero",
            ));
        }
        Ok(Self {
            sample_rate,
            channels,
            sample_format: SampleFormat::F32,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PcmBuffer {
    pub format: AudioFormat,
    pub samples: Arc<[f32]>,
}

impl PcmBuffer {
    pub fn new(format: AudioFormat, samples: impl Into<Arc<[f32]>>) -> Result<Self> {
        let samples = samples.into();
        if samples.is_empty() {
            return Err(CuttledocError::new(
                ErrorCode::InvalidInput,
                "PCM input must contain at least one frame",
            ));
        }
        if samples.len() % usize::from(format.channels) != 0 {
            return Err(CuttledocError::new(
                ErrorCode::InvalidInput,
                "interleaved sample count must be divisible by the channel count",
            ));
        }
        Ok(Self { format, samples })
    }

    pub fn frame_count(&self) -> usize {
        self.samples.len() / usize::from(self.format.channels)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_buffer_validates_interleaved_frames() {
        let format = AudioFormat::new(16_000, 2).expect("valid format");
        assert!(PcmBuffer::new(format, Vec::<f32>::new()).is_err());
        assert!(PcmBuffer::new(format, vec![0.0, 0.0, 0.0]).is_err());
        assert_eq!(
            PcmBuffer::new(format, vec![0.0, 0.0, 0.0, 0.0])
                .expect("valid PCM")
                .frame_count(),
            2
        );
    }
}
