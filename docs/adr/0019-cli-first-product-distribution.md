# ADR-0019: Use CLI-first product distribution

## Status

Accepted

## Context

ADR-0001 established the Rust core as the owner of Cuttledoc behavior and
planned Rust, CLI, and Node.js product surfaces. The Node proof subsequently
validated a thin `napi-rs` adapter and compiler-free npm artifact, but the
release cost remains material: every supported target needs a native addon,
package assembly, Node-version testing, and npm publication policy in addition
to the native CLI.

Offcourse is the first concrete Node.js consumer. It already orchestrates
external processes such as FFmpeg, owns concrete downloaded video paths,
persists job state in SQLite, and can consume schema-versioned JSON while
keeping progress on standard error. Its transcription work is coarse-grained
per media file rather than a high-frequency in-process API.

The current CLI and Node adapter both use one-shot transcription operations.
The Node adapter therefore does not currently avoid per-file recognition or
enhancement runtime acquisition. Publishing it would add distribution
complexity without yet providing a measured batch-performance advantage.

## Decision

The initial Cuttledoc v3 product distribution is CLI-first:

- the Rust core remains the sole owner of product behavior;
- the native `cuttledoc` CLI is the supported installed product surface;
- programmatic process consumers use schema-versioned JSON on standard output,
  typed progress and diagnostics on standard error, stable exit codes, and an
  explicitly configurable executable path;
- Offcourse validates this contract as the first external process consumer;
- the existing `cuttledoc-node` crate and JavaScript facade remain tested
  experimental adapters, but they are not published and do not block the first
  v3 release;
- crates.io and npm publication are separate future decisions rather than
  implicit requirements of the first CLI release.

If measurement shows that process or model startup materially harms multi-file
workloads, Cuttledoc first adds a long-lived batch/worker CLI protocol that can
reuse a runtime across jobs while preserving process isolation.

Public Node-API distribution is reconsidered only when concrete consumers need
in-process PCM or streaming integration, its performance benefit is measured,
and the supported platform/package matrix justifies its release cost.

## Consequences

### Positive

- The first release has one native artifact contract per target and no npm
  binary-package matrix.
- Node.js applications can integrate immediately without native addon loading
  or package-manager lifecycle behavior.
- Native crashes and large model memory remain isolated from the caller.
- A future worker protocol can provide reuse to Node, shell, Rust, and other
  process consumers equally.
- The existing Node proof is retained rather than deleted prematurely.

### Negative

- Process consumers must locate and supervise a Cuttledoc executable.
- One process per file can repeat startup work until a batch protocol exists.
- In-process PCM buffers and fine-grained streaming callbacks are not part of
  the supported Node integration in the first release.
- The experimental Node adapter can drift unless its non-product status and
  test scope remain explicit.

## Validation and review triggers

The Offcourse vertical slice must transcribe several downloaded media files,
persist success/failure state, consume only machine-readable output, and
measure startup, total duration, and peak memory.

Add a batch worker when repeated startup is material relative to recognition
time. Reconsider public Node-API artifacts when at least one real integration
cannot reasonably use the process contract or measured in-process reuse
provides a meaningful product advantage.

## References

- [ADR-0001](0001-rust-core-and-single-product-api.md)
- [Public API](../public-api.md)
- [Release artifact plan](../plans/reproducible-v3-release-artifacts.md)
