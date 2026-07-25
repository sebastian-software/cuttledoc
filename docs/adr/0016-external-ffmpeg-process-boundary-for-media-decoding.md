# ADR-0016: External FFmpeg process boundary for initial media decoding

## Status

Accepted

## Context

The first Apple Speech product slice accepts validated mono `f32` PCM. Normal
podcast, audiobook, and video inputs need probing, audio-stream selection,
decoding, downmixing, and resampling before they can use that path.

Cuttledoc 2 preserved broad format compatibility through a separate Node
package which downloaded an FFmpeg binary during `postinstall`. Its default
decoder also applied bandpass and loudness filters. Mandatory install-time
downloads conflict with the v3 packed-artifact contract, and unconditional
filters conflict with the conservative preprocessing boundary for clean
produced audio.

FFmpeg is an established codec implementation with a maintained release and
security process. Version 8.1.2 is the current evidence-host version and the
latest release at this decision date. FFmpeg is primarily LGPL-2.1-or-later;
optional components can make a particular build GPL-2.0-or-later. Selecting a
binary for redistribution therefore requires reviewing the exact build, not
only the FFmpeg version.

## Decision

Cuttledoc initially decodes general media by invoking an external FFmpeg
executable through a narrow repository-owned process boundary.

- Executable resolution checks an explicit API/CLI path, then `FFMPEG_PATH`,
  then `ffmpeg` on the process `PATH`.
- Rust invokes the executable directly with structured arguments. It never
  constructs a shell command.
- The decoder selects the first audio stream and emits mono 16 kHz
  little-endian `f32` PCM.
- The default applies no audio filters, denoising, dereverberation, loudness
  normalization, or peak normalization.
- Rust owns stdout parsing, bounded stderr diagnostics, cancellation, child
  termination/reaping, PCM validation, temporary state, and stable error
  mapping.
- Rust, CLI, and Node file APIs call the same decoder and existing
  transcription operation. JavaScript does not spawn FFmpeg or transform
  audio.

The initial source-integrated implementation supports a configured or
user-installed executable. Cuttledoc does not bundle, download, or redistribute
FFmpeg in this decision.

A self-contained release remains a separate delivery checkpoint. Before
shipping a managed FFmpeg executable, the repository must record its exact
source and version, build configuration and resulting license, digest,
supported platform matrix, source-code offer/hosting obligations, security
update process, signing, artifact-size impact, and rollback procedure. npm
install lifecycle downloads remain prohibited.

## Consequences

- The first file path can reuse mature codec support without adding a Rust
  codec portfolio, native library link boundary, or JavaScript orchestration.
- Source builds become useful immediately on machines with FFmpeg installed or
  explicitly configured.
- The initial npm tarball is not yet self-contained for arbitrary media files;
  PCM input remains available without FFmpeg.
- Exact supported codecs depend on the selected external FFmpeg build until a
  managed release artifact is accepted.
- Malformed or adversarial media is processed by a separate child process, but
  Cuttledoc must still track FFmpeg security releases and bound captured
  diagnostics and memory.
- Holding the complete decoded PCM buffer is an explicit first-checkpoint
  ceiling. Representative long-form memory measurements determine when a
  chunked decoder-to-engine stream becomes release-blocking.

## Validation and review triggers

The boundary is validated with hermetic child-process tests and real WAV,
Ogg/Opus, MP3, and M4A variants of one pinned fixture. Tests cover executable
resolution, exact arguments, incomplete PCM, bounded stderr, nonzero exits,
cancellation, and child reaping.

Revisit this decision before distributing any FFmpeg binary, when the first
supported 16 GB machine cannot handle the measured long-form buffer, when
format requirements can be met by a materially smaller maintained decoder, or
when license/security changes affect the selected release path.

## References

- [Issue #23](https://github.com/sebastian-software/cuttledoc-rs/issues/23)
- [ADR-0005](0005-third-party-dependency-policy.md)
- [Target architecture](../architecture.md)
- [Audio use cases](../audio-use-cases.md)
- [FFmpeg releases](https://ffmpeg.org/releases/)
- [FFmpeg legal and license guidance](https://ffmpeg.org/legal.html)
- [FFmpeg security process](https://ffmpeg.org/security.html)
