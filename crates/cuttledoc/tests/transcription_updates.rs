use cuttledoc::{
    Stability, TimeRange, TranscriptReducer, TranscriptionSegment, TranscriptionUpdate,
    TranscriptionUpdateKind,
};

const VECTORS: &str = include_str!("../../../fixtures/contracts/transcription-updates.tsv");

#[test]
fn shared_contract_vectors_are_deterministic() {
    let mut current_case = "";
    let mut reducer = TranscriptReducer::default();

    for (line_index, line) in VECTORS.lines().enumerate() {
        if line.is_empty() || line.starts_with('#') || line.starts_with("case\t") {
            continue;
        }
        let fields = line.split('\t').collect::<Vec<_>>();
        assert_eq!(
            fields.len(),
            11,
            "invalid vector at line {}",
            line_index + 1
        );

        if fields[0] != current_case {
            current_case = fields[0];
            reducer = TranscriptReducer::default();
        }

        let affected_range = TimeRange::from_millis(number(fields[4]), number(fields[5]));
        let kind = match fields[2] {
            "replace" => TranscriptionUpdateKind::Replace {
                segments: vec![TranscriptionSegment {
                    range: TimeRange::from_millis(number(fields[6]), number(fields[7])),
                    text: decode(fields[8]),
                    confidence: None,
                    words: Vec::new(),
                }],
                stability: match fields[3] {
                    "volatile" => Stability::Volatile,
                    "final" => Stability::Final,
                    other => panic!("unknown stability {other} at line {}", line_index + 1),
                },
            },
            "revoke" => TranscriptionUpdateKind::Revoke,
            other => panic!("unknown operation {other} at line {}", line_index + 1),
        };
        let result = reducer.apply(TranscriptionUpdate {
            sequence: number(fields[1]),
            affected_range,
            kind,
        });

        if fields[10] == "-" {
            result.unwrap_or_else(|error| {
                panic!(
                    "case {current_case} line {} unexpectedly failed: {error:?}",
                    line_index + 1
                )
            });
        } else {
            let error = result.expect_err("vector expected a contract error");
            assert_eq!(error.code(), fields[10], "case {current_case}");
        }
        assert_eq!(
            reducer.current_text(),
            decode(fields[9]),
            "case {current_case}"
        );
    }
}

fn number(value: &str) -> u64 {
    value
        .parse()
        .unwrap_or_else(|_| panic!("invalid number {value}"))
}

fn decode(value: &str) -> String {
    if value == "~" || value == "-" {
        String::new()
    } else {
        value.replace('_', " ")
    }
}
