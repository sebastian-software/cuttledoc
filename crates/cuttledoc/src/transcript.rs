use std::path::PathBuf;
use std::time::Duration;

use crate::{BackendId, BackendSelection, ModelId};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimeRange {
    pub start: Duration,
    pub end: Duration,
}

impl TimeRange {
    pub const fn new(start: Duration, end: Duration) -> Self {
        Self { start, end }
    }

    pub const fn from_millis(start: u64, end: u64) -> Self {
        Self::new(Duration::from_millis(start), Duration::from_millis(end))
    }

    pub fn is_valid(self) -> bool {
        self.start < self.end
    }

    pub fn contains(self, other: Self) -> bool {
        self.start <= other.start && self.end >= other.end
    }

    pub fn overlaps(self, other: Self) -> bool {
        self.start < other.end && other.start < self.end
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WordTimestamp {
    pub range: TimeRange,
    pub text: String,
    pub confidence: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptionSegment {
    pub range: TimeRange,
    pub text: String,
    pub confidence: Option<f32>,
    pub words: Vec<WordTimestamp>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Stability {
    Volatile,
    Final,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TranscriptionUpdateKind {
    Replace {
        segments: Vec<TranscriptionSegment>,
        stability: Stability,
    },
    Revoke,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptionUpdate {
    pub sequence: u64,
    pub affected_range: TimeRange,
    pub kind: TranscriptionUpdateKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContractError {
    UnexpectedSequence { expected: u64, actual: u64 },
    InvalidAffectedRange,
    EmptyReplacement,
    InvalidSegmentRange,
    SegmentOutsideAffectedRange,
    SegmentsNotOrdered,
    SegmentsOverlap,
    FinalizedRangeOverlap,
    PartialVolatileOverlap,
}

impl ContractError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::UnexpectedSequence { .. } => "unexpected_sequence",
            Self::InvalidAffectedRange => "invalid_affected_range",
            Self::EmptyReplacement => "empty_replacement",
            Self::InvalidSegmentRange => "invalid_segment_range",
            Self::SegmentOutsideAffectedRange => "segment_outside_affected_range",
            Self::SegmentsNotOrdered => "segments_not_ordered",
            Self::SegmentsOverlap => "segments_overlap",
            Self::FinalizedRangeOverlap => "finalized_range_overlap",
            Self::PartialVolatileOverlap => "partial_volatile_overlap",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
struct StoredSegment {
    segment: TranscriptionSegment,
    stability: Stability,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptReducer {
    next_sequence: u64,
    segments: Vec<StoredSegment>,
}

impl Default for TranscriptReducer {
    fn default() -> Self {
        Self {
            next_sequence: 1,
            segments: Vec::new(),
        }
    }
}

impl TranscriptReducer {
    pub const fn next_sequence(&self) -> u64 {
        self.next_sequence
    }

    pub fn apply(&mut self, update: TranscriptionUpdate) -> Result<(), ContractError> {
        if update.sequence != self.next_sequence {
            return Err(ContractError::UnexpectedSequence {
                expected: self.next_sequence,
                actual: update.sequence,
            });
        }
        if !update.affected_range.is_valid() {
            return Err(ContractError::InvalidAffectedRange);
        }
        if self.segments.iter().any(|stored| {
            stored.stability == Stability::Final
                && stored.segment.range.overlaps(update.affected_range)
        }) {
            return Err(ContractError::FinalizedRangeOverlap);
        }
        if self.segments.iter().any(|stored| {
            stored.stability == Stability::Volatile
                && stored.segment.range.overlaps(update.affected_range)
                && !update.affected_range.contains(stored.segment.range)
        }) {
            return Err(ContractError::PartialVolatileOverlap);
        }

        let replacement = match update.kind {
            TranscriptionUpdateKind::Replace {
                segments,
                stability,
            } => {
                validate_replacement(update.affected_range, &segments)?;
                Some((segments, stability))
            }
            TranscriptionUpdateKind::Revoke => None,
        };

        self.segments.retain(|stored| {
            stored.stability == Stability::Final
                || !stored.segment.range.overlaps(update.affected_range)
        });

        if let Some((segments, stability)) = replacement {
            self.segments.extend(
                segments
                    .into_iter()
                    .map(|segment| StoredSegment { segment, stability }),
            );
            self.segments
                .sort_by_key(|stored| (stored.segment.range.start, stored.segment.range.end));
        }

        self.next_sequence += 1;
        Ok(())
    }

    pub fn current_text(&self) -> String {
        join_text(
            self.segments
                .iter()
                .map(|stored| stored.segment.text.as_str()),
        )
    }

    pub fn final_text(&self) -> String {
        join_text(
            self.segments
                .iter()
                .filter(|stored| stored.stability == Stability::Final)
                .map(|stored| stored.segment.text.as_str()),
        )
    }

    pub fn final_segments(&self) -> Vec<TranscriptionSegment> {
        self.segments
            .iter()
            .filter(|stored| stored.stability == Stability::Final)
            .map(|stored| stored.segment.clone())
            .collect()
    }

    pub fn segment_count(&self) -> usize {
        self.segments.len()
    }
}

fn validate_replacement(
    affected_range: TimeRange,
    segments: &[TranscriptionSegment],
) -> Result<(), ContractError> {
    if segments.is_empty() {
        return Err(ContractError::EmptyReplacement);
    }

    let mut previous: Option<TimeRange> = None;
    for segment in segments {
        if !segment.range.is_valid() {
            return Err(ContractError::InvalidSegmentRange);
        }
        if !affected_range.contains(segment.range) {
            return Err(ContractError::SegmentOutsideAffectedRange);
        }
        if let Some(previous) = previous {
            if segment.range.start < previous.start {
                return Err(ContractError::SegmentsNotOrdered);
            }
            if previous.overlaps(segment.range) {
                return Err(ContractError::SegmentsOverlap);
            }
        }
        previous = Some(segment.range);
    }
    Ok(())
}

fn join_text<'a>(parts: impl Iterator<Item = &'a str>) -> String {
    parts
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct TranscribeOptions {
    pub backend: BackendSelection,
    pub model: Option<ModelId>,
    pub model_path: Option<PathBuf>,
    pub language: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub backend: BackendId,
    pub model: Option<ModelId>,
    pub media_duration: Duration,
    pub processing_duration: Duration,
    pub segments: Vec<TranscriptionSegment>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(start: u64, end: u64, text: &str) -> TranscriptionSegment {
        TranscriptionSegment {
            range: TimeRange::from_millis(start, end),
            text: text.to_owned(),
            confidence: None,
            words: Vec::new(),
        }
    }

    #[test]
    fn rejected_update_does_not_advance_sequence_or_mutate_state() {
        let mut reducer = TranscriptReducer::default();
        let error = reducer
            .apply(TranscriptionUpdate {
                sequence: 1,
                affected_range: TimeRange::from_millis(0, 100),
                kind: TranscriptionUpdateKind::Replace {
                    segments: vec![segment(0, 200, "outside")],
                    stability: Stability::Final,
                },
            })
            .expect_err("invalid segment must fail");

        assert_eq!(error, ContractError::SegmentOutsideAffectedRange);
        assert_eq!(reducer.next_sequence(), 1);
        assert_eq!(reducer.segment_count(), 0);
        assert_eq!(reducer.final_segments(), Vec::new());
    }
}
