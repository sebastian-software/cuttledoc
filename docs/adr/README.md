# Architecture decision records

ADRs capture decisions that materially constrain the implementation. Proposed ADRs must be validated by the relevant spike before being marked accepted.

| ADR                                                                    | Title                                              | Status   |
| ---------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| [0001](0001-rust-core-and-single-product-api.md)                       | Rust core and a single product API                 | Accepted |
| [0002](0002-incubator-and-product-repository.md)                       | Incubator and product repository strategy          | Accepted |
| [0003](0003-staged-native-interop.md)                                  | Staged, runtime-neutral native interop              | Accepted |
| [0004](0004-task-oriented-engines-and-runtime-adapters.md)             | Task-oriented engines and internal runtime adapters | Accepted |
| [0005](0005-third-party-dependency-policy.md)                          | Strict third-party dependency acceptance policy    | Accepted |
| [0006](0006-apple-runtime-and-model-selection-by-bakeoff.md)           | Apple runtime and model selection by bakeoff        | Accepted |
| [0007](0007-apple-silicon-macos-26-baseline.md)                        | Apple Silicon and macOS 26 baseline for v3          | Accepted |
| [0008](0008-streaming-first-transcription-results.md)                  | Streaming-first transcription results               | Accepted |
| [0009](0009-voice-pipeline-direction-and-staged-speech-synthesis.md)   | Voice-pipeline direction and staged speech synthesis | Accepted |
| [0010](0010-capability-oriented-engine-ownership.md)                   | Capability-oriented engine ownership and backend identity | Accepted |
| [0011](0011-us-english-project-language.md)                            | US English as the project language                   | Accepted |
| [0012](0012-official-mlx-boundary-for-voxtral.md)                      | Official MLX boundary for Voxtral                    | Accepted |
| [0013](0013-select-transcript-enhancement-model-before-embedded-runtime.md) | Select the transcript-enhancement model before its embedded runtime | Accepted |
| [0014](0014-local-first-transcript-enhancement-defaults.md)            | Local-first transcript-enhancement defaults          | Accepted |

Status values: proposed, accepted, superseded, rejected.

During the current shaping phase, ADRs are working material and may be edited in place as research or spikes correct the decision. Once Phase 1 implementation starts, accepted ADRs are immutable; later changes must add a superseding ADR.
