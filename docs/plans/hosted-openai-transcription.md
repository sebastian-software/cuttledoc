# Hosted OpenAI transcription and cloud-only platform plan

## Status

- Priority: P1
- Effort: L
- Risk: HIGH
- Issue: #26
- Depends on: #23 and #27, both complete
- Planned at: `24754cb`, 2026-07-27
- Working state: clean

## Why this matters

Cuttledoc v3 has complete local transcription paths on the macOS 26 Apple
Silicon baseline, but it cannot yet preserve Cuttledoc 2's explicit OpenAI
transcription path or provide a useful Linux/Windows product. Issue #26 closes
that gap without weakening the local-first policy: a caller must explicitly
select the hosted backend, and `auto` must never make a remote request.

The provider boundary is security-sensitive. Audio and a credential cross a
network boundary, so request cancellation, bounded diagnostics, credential
redaction, and artifact-level platform tests are part of the implementation,
not follow-up polish.

## Current state

- `crates/cuttledoc/src/media.rs` always decodes a file with FFmpeg before
  recognition. Hosted transcription must branch before decoding and upload the
  original bounded file.
- `crates/cuttledoc/src/recognition.rs` selects only `apple-speech` and
  `whisper`. Its `auto` policy is already local-only and must remain so.
- `crates/cuttledoc/src/transcript.rs` has no secret-safe hosted request
  options.
- `crates/cuttledoc/src/capability.rs` reports only local recognition
  backends.
- `crates/cuttledoc-cli/src/main.rs` accepts open backend IDs syntactically but
  has no hosted credential or timeout contract.
- `crates/cuttledoc-node/src/lib.rs` and `packages/cuttledoc/` expose only the
  macOS local package.
- `.github/workflows/ci.yml` tests the portable workspace on Linux but has no
  Windows build or hosted contract exercise.
- `docs/migration-inventory.md` records the Cuttledoc 2 contract: explicit or
  `OPENAI_API_KEY` credentials, multipart upload, model selection,
  model-dependent timestamps, and structured result conversion.

The canonical OpenAI endpoint is
`POST https://api.openai.com/v1/audio/transcriptions`. The current OpenAPI
contract requires multipart form data with `file` and `model`. The selected
initial models are:

- `gpt-4o-transcribe`: JSON text, no timestamp promise;
- `gpt-4o-mini-transcribe`: JSON text, no timestamp promise;
- `whisper-1`: `verbose_json` with segment timestamps.

OpenAI currently limits bounded uploads to 25 MB. Oversized-file splitting,
Realtime transcription, diarization, translation, and arbitrary compatible
providers are outside this issue.

## Decisions for this slice

1. Add a private portable `cuttledoc-openai-transcription` adapter. It owns the
   HTTP endpoint, multipart schema, accepted model table, response parsing,
   timeout/cancellation behavior, and secret-safe errors. No OpenAI SDK type
   enters the public API.
2. Use the pinned Hyper/Rustls HTTP/1 stack admitted in
   `docs/dependency-policy.md`: `bytes` `1.12.1`, `http-body-util` `0.1.4`,
   `hyper` `1.11.0`, `hyper-rustls` `0.27.9`, `hyper-util` `0.1.20`, and Tokio
   `1.53.1`. Only HTTP/1, the current-thread Tokio runtime, bounded body
   utilities, native certificate roots, TLS 1.2/1.3, and the `ring` Rustls
   provider are enabled. The adapter owns the fixed URI and small multipart
   encoder rather than admitting a generic high-level web client.
3. Keep the public operation synchronous. The adapter runs one bounded
   current-thread async HTTP operation internally so dropping the request
   future cancels in-flight I/O without imposing an async runtime on callers.
4. Add provider-neutral hosted options to `TranscribeOptions`: an optional
   redacting in-memory credential and a positive request timeout. When no
   in-memory credential is supplied, the explicit OpenAI path reads
   `OPENAI_API_KEY`.
5. Route only explicit `backend: openai-transcription` file requests to the
   network. `auto`, PCM input, and a configured credential by themselves never
   select hosted processing.
6. Upload the original file and reject unsupported or over-25-MB inputs before
   the request. The adapter uses JSON output for GPT transcription models and
   verbose JSON segment output for `whisper-1`.
7. Keep `media_duration` at zero when the selected OpenAI response format does
   not report duration; expose no synthetic segments or timestamps. This
   preserves the existing result shape without inventing evidence. The
   capability record states that timestamp support is model-dependent and the
   per-result empty segment list remains authoritative.
8. The CLI reads credentials only from `OPENAI_API_KEY`. It deliberately has no
   API-key flag because process arguments are observable. Rust and Node may
   pass an ephemeral in-memory credential.
9. Produce separate cloud-only CLI and Node artifacts for Linux x64 and Windows
   x64. They contain no Apple framework, MLX, Whisper, model, FFmpeg, compiler,
   or install-time build requirement.

## Scope

In scope:

- `crates/adapters/openai-transcription/`: portable provider adapter and
  hermetic HTTP contract tests;
- `Cargo.toml`, `Cargo.lock`, `deny.toml`, dependency policy and allowlist;
- Rust backend identity, options, capabilities, errors, file routing, and
  result mapping;
- CLI explicit selection, capability output, progress, errors, and environment
  credential handling;
- Node-API options, validation, abort propagation, types, and package loading;
- Linux and Windows source CI plus final cloud-only artifact tests;
- an explicitly gated live smoke using a pinned small fixture and
  `OPENAI_API_KEY`, with no captured credential, request, response, or audio;
- public API, compatibility, package, and migration documentation.

Out of scope:

- automatic remote fallback;
- hosted transcript enhancement from #25;
- PCM upload, Realtime transcription, diarization, translation, or streaming
  transcript deltas;
- automatic compression or splitting above 25 MB;
- bundled FFmpeg or local ASR/LLM artifacts on Linux and Windows;
- a generic OpenAI-compatible endpoint or user-configurable base URL;
- release signing, notarization, SBOM, provenance, and final publication from
  #28.

## Verification commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Adapter contract | `cargo test -p cuttledoc-openai-transcription --locked` | Multipart, mapping, timeout, cancellation, bounded-error, and redaction cases pass without public network access. |
| Rust/core | `cargo test -p cuttledoc --locked` | Explicit hosted routing works and `auto` remains local-only. |
| CLI | `cargo test -p cuttledoc-cli --locked` | Parsing, output, progress, and secret-safe error cases pass. |
| Node | `cargo test -p cuttledoc-node --locked` | Options, result mapping, and abort propagation pass. |
| Portable workspace | `cargo test --workspace --locked` | Workspace tests pass on the development host and Linux CI. |
| Windows source gate | `cargo check --workspace --all-targets --locked` | Workspace compiles on `windows-latest`. |
| Dependency admission | `bash scripts/check-dependency-policy.sh` | Every direct dependency is reviewed and allowlisted. |
| Style/lints | `cargo fmt --check && cargo clippy --workspace --all-targets --locked -- -D warnings` | No formatting or lint failures. |
| Cloud-only artifacts | repository package harnesses on Linux x64 and Windows x64 | Extracted CLI and installed Node package load and execute the mocked hosted smoke with compiler commands blocked and no Apple/local-model files. |
| Live smoke | explicitly dispatched workflow with `OPENAI_API_KEY` | The digest-pinned fixture returns non-empty text; logs and retained artifacts contain no secret or audio. |

## Steps

### 1. Admit the portable HTTP boundary

Add the adapter crate skeleton, dependency-policy rows, exact pins, minimal
features, and lockfile. Record the resolved runtime graph, license set, source
policy, binary impact, update owner, and replacement path. Keep TLS certificate
validation enabled and disable request-level verbose logging.

Verify: dependency admission, `cargo metadata --locked`, and adapter build.

### 2. Implement and prove the provider contract

Implement redacting credentials, model validation, 25-MB/file-format
validation, multipart construction, bounded response reads, strict JSON
mapping, stable status/error categories, a total request timeout, and active
cancellation. Use a loopback mock server for request, response, status,
timeout, cancellation, oversized-body, and credential-redaction tests.

No test may contact `api.openai.com`.

Verify: adapter contract tests.

### 3. Integrate the Rust product boundary

Add `openai-transcription` to backend identity and capabilities, introduce the
provider-neutral hosted options, map adapter errors into stable product
errors, and branch explicit hosted file operations before FFmpeg. Preserve the
existing local PCM path and prove that `auto` ignores both the hosted
capability and configured credentials.

Verify: adapter and `cuttledoc` tests.

### 4. Cross CLI and Node surfaces

Expose the backend/model/timeout contract in CLI help and output. Read the CLI
credential only from the environment. Add Node in-memory credential and
timeout options with redacting native errors and active `AbortSignal`
propagation. Keep enhancement selection independent from recognition.

Verify: CLI, Node, ESM, and CommonJS tests.

### 5. Add cloud-only platform artifacts

Split artifact features so Linux/Windows do not compile or package Apple,
Whisper, MLX, FFmpeg, or model assets. Add Linux x64 and Windows x64 CLI
archives and Node packages, and exercise each final artifact against a local
mock endpoint or equivalent hermetic provider fixture. Installation must not
invoke native compilers.

Verify: platform artifact harnesses and CI matrix.

### 6. Run the opt-in live smoke and close the issue

Add a manual/secret-gated workflow using one small digest-pinned fixture. The
workflow must suppress request detail, retain no input/output artifact, and
scan captured logs for the credential before success. Record only model,
fixture digest, platform, success state, and bounded timing evidence.

Reconcile `PLAN.md`, `docs/compatibility-matrix.md`, public/package docs, and
issue #26. Do not claim #28 release completion.

## Done criteria

- [x] Mocked contract tests cover request, response, provider errors, timeout,
      active cancellation, body bounds, and credential redaction.
- [x] Rust accepts an explicit in-memory credential or `OPENAI_API_KEY`.
- [x] CLI accepts credentials only through `OPENAI_API_KEY`.
- [x] Node accepts an optional ephemeral in-memory credential.
- [x] Explicit model selection covers both GPT transcription models and
      timestamp-capable `whisper-1`.
- [x] A configured credential never changes `auto` selection.
- [x] No credential appears in `Debug`, errors, CLI arguments, logs, output, or
      persisted configuration.
- [ ] Linux and Windows final CLI/Node artifacts install, load, and exercise
      hosted transcription without Apple/local-model artifacts or compilers.
- [ ] The live smoke is opt-in, fixture-pinned, secret-safe, and retains no
      credential or audio.
- [ ] Workspace format, lint, tests, dependency policy, and platform CI pass.
- [ ] Documentation and issue #26 reflect verified artifact evidence.

## Stop conditions

- Stop and revise this plan if the selected HTTP/TLS graph cannot pass
  ADR-0005, the license policy, or the Rust 1.88 baseline without waivers.
- Stop before changing the public result shape if truthful hosted mapping
  cannot be represented without a breaking semantic ambiguity.
- Stop before adding audio splitting, transcoding, Realtime, diarization, or a
  configurable endpoint; those materially expand the provider and security
  boundary.
- Stop the live smoke if no dedicated OpenAI credential is available or if the
  workflow cannot prove log/artifact hygiene.

## Maintenance and review focus

Reviewers should focus on five invariants: hosted use is explicit; secrets are
not format-able; request/response memory is bounded; cancellation drops the
active network operation; and Linux/Windows artifacts contain only the
cloud-only path. OpenAI model/format changes are isolated to the private
adapter model table and its contract tests.
