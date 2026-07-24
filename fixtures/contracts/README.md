# Contract fixtures

`transcription-updates.tsv` is a repository-authored semantic fixture for the
range-addressed transcription stream defined by ADR-0008. It contains no
third-party text, audio, or model output and is covered by the repository's MIT
license.

The fixture was created during the Phase 0 stream-contract spike and is now
executed directly by the product `cuttledoc` crate. It covers finals-only
updates, volatile replacement, revocation, immutable-final overlap, sequence
gaps, and invalid ranges. Changes must preserve or deliberately version these
cross-binding semantics.
