# ADR-0002: Incubator and product repository strategy

## Status

Superseded by [ADR-0018](0018-cut-over-to-the-cuttledoc-product-repository.md)

## Context

The Rust implementation combines three repositories and may take multiple phases to reach production parity. Developing directly on Cuttledoc's default branch would mix an incomplete architecture with a released TypeScript product. Treating one of the CoreML repositories as a fork base would incorrectly privilege one implementation and cannot represent the combined history.

At the same time, the existing `sebastian-software/cuttledoc` repository owns the product identity, users, releases, documentation, issues, and npm package.

## Decision

Use `sebastian-software/cuttledoc-rs` as a public Greenfield incubator for planning, spikes, and the staged implementation.

- It is not a GitHub fork.
- Existing repositories remain production sources of truth until compatibility gates pass.
- Source baselines are recorded by commit in the migration inventory.
- Relevant fixes continue in the existing repositories during incubation.
- At release readiness, integrate the Rust implementation into `sebastian-software/cuttledoc` and release it there as the next major version.
- Do not reuse the `cuttledoc` repository name for a different GitHub repository, because that risks breaking redirects and product continuity.

## Consequences

### Positive

- Clean history for architectural spikes.
- Production maintenance continues without exposing half-built code.
- The combined origin is explicit rather than modeled as a misleading fork.
- The final product retains existing GitHub and npm identity.

### Negative

- Two Cuttledoc repositories exist temporarily.
- Issues and decisions can diverge unless cross-linked.
- Moving the implementation into the product repository requires a deliberate history/import strategy.

## Guardrails

- Every phase has time-bounded exit criteria.
- The incubator README prominently states its status.
- User-facing documentation continues to point to production Cuttledoc until release readiness.
- Important behavior changes are recorded as ADRs and later migrated with the code.
- The incubator is not published as stable `cuttledoc` on crates.io or npm before the product migration decision.

## Alternatives considered

### A long-lived rewrite branch in the existing repository

This preserves one repository but makes broad experimentation harder to isolate and can accumulate merge pressure against active v2 maintenance.

### Permanent `cuttledoc-rs` product repository

This fragments product identity and forces users to discover whether Cuttledoc or Cuttledoc-rs is canonical.

### Fork `parakeet-coreml` or `whisper-coreml`

Neither is the complete product or a suitable single ancestor for the combined architecture.

## Validation

The public incubator exists at `sebastian-software/cuttledoc-rs`. It remains temporary by decision: a later ADR must define the exact history/import mechanism and release cutover back into the Cuttledoc product repository once the compatibility gates pass.
