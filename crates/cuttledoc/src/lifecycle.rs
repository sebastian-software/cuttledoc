use crate::{CuttledocError, ErrorCode, Result};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EngineState {
    Loading,
    Ready,
    Closing,
    Closed,
    Failed,
}

impl EngineState {
    pub const fn accepts_work(self) -> bool {
        matches!(self, Self::Ready)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QueuePolicy {
    Wait { capacity: usize },
    Reject { capacity: usize },
}

impl QueuePolicy {
    pub fn wait(capacity: usize) -> Result<Self> {
        validate_capacity(capacity)?;
        Ok(Self::Wait { capacity })
    }

    pub fn reject(capacity: usize) -> Result<Self> {
        validate_capacity(capacity)?;
        Ok(Self::Reject { capacity })
    }

    pub const fn capacity(self) -> usize {
        match self {
            Self::Wait { capacity } | Self::Reject { capacity } => capacity,
        }
    }
}

fn validate_capacity(capacity: usize) -> Result<()> {
    if capacity == 0 {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "queue capacity must be greater than zero",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ready_engines_accept_work() {
        assert!(EngineState::Ready.accepts_work());
        assert!(!EngineState::Closing.accepts_work());
        assert!(!EngineState::Closed.accepts_work());
    }

    #[test]
    fn queue_capacity_is_bounded_and_explicit() {
        assert!(QueuePolicy::wait(0).is_err());
        assert_eq!(QueuePolicy::reject(4).expect("valid queue").capacity(), 4);
    }
}
