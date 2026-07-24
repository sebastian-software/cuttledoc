#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProgressPhase {
    Preparing,
    Downloading,
    Decoding,
    Loading,
    Transcribing,
    Enhancing,
    Finalizing,
}

impl ProgressPhase {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Preparing => "preparing",
            Self::Downloading => "downloading",
            Self::Decoding => "decoding",
            Self::Loading => "loading",
            Self::Transcribing => "transcribing",
            Self::Enhancing => "enhancing",
            Self::Finalizing => "finalizing",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgressEvent {
    pub phase: ProgressPhase,
    pub completed: u64,
    pub total: Option<u64>,
    pub message: Option<String>,
}

impl ProgressEvent {
    pub fn fraction(&self) -> Option<f64> {
        let total = self.total?;
        if total == 0 {
            return None;
        }
        Some(self.completed.min(total) as f64 / total as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fraction_is_bounded_and_optional() {
        let event = ProgressEvent {
            phase: ProgressPhase::Downloading,
            completed: 12,
            total: Some(10),
            message: None,
        };
        assert_eq!(event.fraction(), Some(1.0));
        assert_eq!(
            ProgressEvent {
                total: Some(0),
                ..event
            }
            .fraction(),
            None
        );
    }
}
