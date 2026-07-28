# ADR-0018: Cut over to the Cuttledoc product repository

## Status

Accepted

## Context

The Rust implementation has moved beyond architecture incubation. It provides
the product core, native CLI, local and hosted transcription, model management,
and transcript enhancement, and it is now preparing reproducible release
artifacts.

ADR-0002 deliberately placed this work in
`sebastian-software/cuttledoc-rs` until the repository migration could be
performed intentionally. Keeping the incubator name through release would
fragment the product identity and make documentation, issues, source metadata,
and release artifacts point at a temporary project.

The existing `sebastian-software/cuttledoc` repository owns the durable
Cuttledoc name and its v1/v2 tags and releases. The previous TypeScript
implementation was an internal pre-product effort with no compatibility
population that requires a parallel maintenance period.

## Decision

`sebastian-software/cuttledoc` is the canonical repository for the Rust
implementation and all future Cuttledoc releases.

The cutover is performed as follows:

- preserve the previous TypeScript default-branch tip as
  `archive/typescript-v2`;
- preserve all existing v1/v2 tags and GitHub releases;
- replace the product repository's `main` branch with the reviewed Rust
  history using a lease-guarded forced update;
- move active Rust delivery issues to the product repository;
- point source metadata, package metadata, documentation, attestations, and
  future releases at `sebastian-software/cuttledoc`;
- retain `sebastian-software/cuttledoc-rs` as historical incubation evidence
  for old issue, CI-run, and research links rather than treating it as a
  product;
- retain Cuttledoc 2 tags and releases as history, without a parallel support
  window, compatibility promise, or required migration path.

The previous TypeScript implementation is not merged into the Rust commit
graph. Its branch, tags, releases, issues, and GitHub history are the explicit
archive and rollback record.

This decision supersedes ADR-0007 only where that record required Cuttledoc 2
maintenance for users on Intel or pre-macOS-26 systems. The Apple Silicon and
macOS 26 baseline itself remains accepted.

## Consequences

### Positive

- Cuttledoc has one product name, default branch, issue tracker, and release
  location.
- The Rust history remains readable instead of being obscured by an unrelated
  merge.
- Previous source and releases remain recoverable without imposing v2
  compatibility work on the initial Rust release.
- Release automation can be designed directly for its permanent repository.

### Negative

- Existing v2 pull requests and implementation-specific issues become obsolete
  and must be closed explicitly.
- Intel Macs and macOS releases before 26 have no supported Cuttledoc product
  after the cutover.
- Links to incubation issues and CI runs continue to reference
  `cuttledoc-rs`; they are historical evidence, not current product links.
- Existing local checkouts must update their remote or be recloned after the
  non-fast-forward cutover.

## Validation and review triggers

The cutover is complete when the product repository's `main` resolves to the
documented Rust cutover commit, the TypeScript tip is reachable through
`archive/typescript-v2`, v1/v2 tags remain present, active Rust issues are in
the product repository, and repository metadata identifies Cuttledoc without
the `-rs` suffix.

Revisit the history strategy only if a concrete legal, provenance, or
maintenance requirement needs the two commit graphs to share ancestry.

## References

- [ADR-0002](0002-incubator-and-product-repository.md)
- [ADR-0007](0007-apple-silicon-macos-26-baseline.md)
- [Migration inventory](../migration-inventory.md)
- [Release artifact plan](../plans/reproducible-v3-release-artifacts.md)
