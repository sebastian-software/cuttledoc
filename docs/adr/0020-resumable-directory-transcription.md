# ADR-0020: Use resumable directory transcription

## Status

Accepted

## Context

ADR-0019 chose the native CLI as Cuttledoc's first supported product surface
and identified a long-lived batch operation as the first response when
per-file model startup becomes material. The first representative Offcourse
archive contains 1,085 MP4 files totaling approximately 79 GB. Starting a
separate Cuttledoc process and loading Whisper for every video would make that
workflow needlessly slow, while loading several model copies concurrently
would increase peak memory.

The archive already has a useful directory structure and may contain
same-stem Markdown course notes. A full run can take hours, so interruption,
partial failure, and safe resume are normal operating conditions rather than
exceptional cases.

## Decision

Cuttledoc provides `transcribe-batch` as a native directory operation:

- recursive discovery is explicit and media files are processed in stable path
  order;
- one recognition session is loaded and reused sequentially for all pending
  files;
- text transcripts are written beside their media as `.txt`; Markdown and JSON
  use `.transcript.md` and `.transcript.json` to avoid course-note collisions;
- sidecars are written atomically, skipped by default when already present, and
  replaced only with explicit `--force`;
- processing continues after a per-file failure and finishes by writing a
  schema-versioned report containing the current invocation's completed
  outputs, detected languages, skipped paths, and failures;
- the default `--language auto` route uses local Whisper language detection and
  never selects a hosted service implicitly;
- enhancement defaults to off. Explicit hosted Gemini enhancement is allowed,
  while local Gemma enhancement waits for a bounded two-phase batch that does
  not keep both large runtimes resident unnecessarily.

The initial operation is sequential. Concurrency becomes configurable only
after measured decoding and recognition throughput shows that it improves wall
time without unacceptable memory growth.

## Consequences

### Positive

- Large archives pay recognition model startup once per batch instead of once
  per file.
- A rerun naturally resumes from missing sidecars without separate queue state.
- Each transcript stays discoverable beside its source video and remains usable
  independently of Cuttledoc.
- Automatic language detection supports mixed-language archives, while an
  explicit language remains available for homogeneous material.
- Failures are durable and machine-readable without blocking unrelated files.

### Negative

- The existence of a sidecar is the resume marker; validating whether an
  existing transcript matches current settings requires a future manifest-aware
  mode.
- Sequential processing does not yet exploit spare compute during FFmpeg
  decoding.
- Automatic language detection can be less stable on very short clips than an
  explicit known language.
- Local transcript enhancement is not part of the first directory operation.

## Validation and review triggers

Unit tests cover recursive discovery, stable ordering, output collisions,
skip/force behavior, partial failure, atomic report output, and detected
language recording.

A 2026-07-28 Apple Silicon release smoke loaded one managed Whisper session,
then transcribed a 136-second English clip and an 8-second German clip in one
process. The progress stream contained one runtime-load boundary, both atomic
sidecars were written, language detection returned `en` and `de`, and the
warmed run completed in 8.45 seconds. A default rerun found both outputs,
loaded no model, reported both skipped paths, and completed in 0.41
milliseconds. A separate video-only MP4 produced `AUDIO_DECODE_FAILED` while
the next valid file still completed and the partial-failure report was written.
The first Core ML initialization immediately after model installation was much
slower than the warmed run and remains a packaging/performance measurement,
not a correctness blocker.

Revisit the decision when users need setting-aware transcript invalidation,
measured concurrency improves throughput within the supported memory envelope,
or local enhancement can use a separate bounded phase.

## References

- [ADR-0019](0019-cli-first-product-distribution.md)
- [Public API](../public-api.md)
