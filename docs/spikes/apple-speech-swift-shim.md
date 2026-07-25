# Apple Speech Swift shim result (#11)

**Disposition:** advance as a first-class bakeoff candidate through a
repository-owned Swift C ABI. This is not a production-backend selection.

**Evidence date:** 2026-07-17.

**Evidence host:** Apple M1 Ultra, 64 GB, macOS 26.5.2 (25F84), Xcode 26.6,
Apple Swift 6.3.3.

**Runnable artifact:** [`spikes/apple-speech-shim`](../../spikes/apple-speech-shim/).

## Result

The Rust example streamed the same normalized 10.56-second FLEURS PCM used by
the CoreML baselines. `SpeechTranscriber` emitted 27 volatile whole-range
replacements followed by one final result:

```text
However, due to the slow communication channels, styles in the West could lag behind by 25 to 30 years.
```

The final result contains 19 word ranges and per-word confidence values from
0.764 to 0.999. It differs from the reference only by pluralizing the last
word: WER 5.26%, CER 1.23% on this one clip. First update latency was 38.3 ms,
analysis/finalization took 198.2 ms (RTF 0.0188), and process peak RSS was
21,921,792 bytes. These are cached-host, single-run spike values, not a model
ranking.

Every volatile result replaced range `0..10560 ms`; only the final result
provided word-level audio attributes and narrowed its native replacement range
to `0..8940 ms`. No empty native result or replacement-free retraction was
observed. The adapter therefore emitted zero `Revoke` events. Its conditional
empty-result mapping remains defensive code, not an empirical claim that Apple
Speech revokes.

Raw updates, attributes, identity, lifecycle transitions, and measurements are
preserved in
[`benchmarks/raw/phase0.apple-speech.fleurs-en-000-1/result.json`](../../benchmarks/raw/phase0.apple-speech.fleurs-en-000-1/result.json).

## PCM and update boundary

The C ABI accepts caller-owned mono f32 PCM because that is Cuttledoc's common
input. A first attempt to pass an f32 `AVAudioPCMBuffer` hit a framework
precondition: Speech recognition requires signed 16-bit sample data. The shim
now clamps, copies, and converts each chunk to non-interleaved Int16 before
constructing `AnalyzerInput`; the caller's memory is reusable as soon as push
returns.

Input uses a 64-chunk `AsyncStream.bufferingOldest` queue. A rejected new chunk
returns status `4`, and the Rust example retries that same chunk. One session's
push/finish/cancel calls must be serialized. Native results are consumed in
order and mapped as:

- non-empty result → range-addressed `replace`;
- `result.isFinal == false` → `volatile`;
- `result.isFinal == true` → `final`;
- empty result → `revoke`, only if actually received.

The callback pointer is borrowed for one call; Rust copies the JSON immediately.
Sequence numbers, strings, ranges, segments, and confidence are then entirely
Rust-owned values.

## Locale and asset evidence

The runtime inventory returned 30 supported locale variants across ten
language identifiers. Twelve German/English variants were initially reported
installed. This is narrower language coverage than Parakeet's 25-language
artifact despite the larger locale-variant count, so capability reporting must
stay dynamic rather than publish a stale “30 languages” claim.

A separate `es-ES` create/cancel probe demonstrated the missing-asset path:

| Moment | Status / reservation |
| --- | --- |
| Before create | `supported`, not installed, not reserved |
| After `downloadAndInstall()` | `installed`, session owns reservation |
| After cancel + destroy | `es-ES` absent from installed/reserved inventory |

The transition proves AssetInventory materialization and reservation cleanup
for this executable identity. It does not distinguish a network download from
locally cached system material. Also, `assetInstallationRequest` returned a
request even for already-installed `en-US`, so request presence alone is not a
download signal; the before/after status is the useful evidence.

## Executable identity and packaging

The probe executable was unbundled, linker-signed ad hoc, had no team
identifier, no embedded `Info.plist`, and no bundle identifier. Transcription,
asset installation, reservation, and release all worked on the evidence host.
This disproves a hard requirement for a conventional app bundle or development
team signature for the tested CLI path.

It does not establish a sound production identity. The Speech framework logged
that an application without a bundle identifier gets an unstable client
identifier. The product must therefore give the shipped CLI a stable bundle
identifier (or require a host app to provide one) before relying on persistent
asset reservations. Signing/notarization still follows the normal shipped
artifact process; the spike found no Speech-specific entitlement.

The optimized Swift dylib was 346,992 bytes and the Rust probe 603,816 bytes,
excluding system frameworks and system-managed Speech assets.

## Actor, cancellation, and cleanup

`SpeechAnalyzer` stays on Swift's actor executor. No main-actor hop is required
and no actor reference crosses C. Result callbacks may arrive on Swift
concurrency workers, so callers must be thread-safe. Asset-backed create and
finish/cancel are blocking C calls over asynchronous Swift tasks; an async Rust
engine must invoke them from a blocking worker.

`cancel` finishes the input continuation, calls `cancelAndFinishNow`, cancels
and joins both Swift tasks, and is idempotent. `destroy` cancels an unfinished
session, releases only a reservation acquired by that session, then releases
the retained Swift object. The checked-in cancellation probe completed without
an update or leaked `es-ES` reservation.

## Remaining bakeoff limitations

Apple does not expose the system asset revision, quantization, or byte size.
Clean-host cold start, relative energy, repeated-run variance, and a
multi-language quality set remain for the broader #4 decision. Those omissions
keep the benchmark record `partial`; they do not block the #11 boundary
disposition.

## Phase 2 productization update

**Evidence date:** 2026-07-24.

The first product adapter preserves the Swift C ABI behind a safe Rust session
that owns callback memory, copies strings and segments immediately, validates
finite PCM before the Swift Float-to-Int16 conversion, exposes bounded queue
backpressure, and makes finish, cancel, and close explicit. The internal
callback transport now uses primitive C fields rather than JSON, avoiding a
JSON parser in the native boundary while preserving update semantics.

The product adapter compiles the Swift module into a static archive, so the
final CLI or Node artifact does not need a separate adapter library. The linked
binary still uses the Swift concurrency runtime supplied by macOS and carries
`/usr/lib/swift` as its runtime search path. This keeps the adapter a build-time
ownership boundary rather than a user-visible plugin.

The product Rust smoke reproduced all 28 FLEURS updates from the Phase 0
record: 27 volatile full-range replacements followed by the same final text
and 19 final word ranges/confidence values. A separate real cancellation run
returned through cancel and destroy without hanging. Restricted process
sandboxes exposed an empty Speech locale inventory for both the original
dynamic spike and the statically linked product form; running the same static
binary with normal macOS system-service access succeeded. Hermetic CI therefore
checks build, link, ownership, and typed callback semantics, while the real
Speech smoke is an explicit host-level gate.

The same pinned PCM now completes through the public
`cuttledoc::transcribe_pcm` function. It returns `en_US`, the exact 10,560 ms
media duration, one final product segment, the unchanged final text, and all 19
word ranges/confidence values. Apple narrows the final native result from the
whole-audio volatile range to the 0–8,940 ms speech range. The product bridge
therefore expands only the reducer's technical affected range to retire the
preceding volatile hypothesis; the returned segment and word timestamps remain
the native Apple values.

The product boundary also exposes the live `SpeechTranscriber` and
`AssetInventory` locale sets through typed callbacks: supported, installed,
reserved, and the maximum reservation count. Public capability reporting now
uses this inventory. A binary compiled for macOS 26 arm64 is no longer reported
as operational merely because the Swift archive linked; an empty or failed
system inventory becomes an actionable unavailable state.

With normal system-service access on the evidence host, the public capability
path reported 10 language identifiers, 30 supported locale variants, 12
installed locales, zero currently reserved locales, and a reservation limit of
five. These counts are a runtime snapshot, not a hardcoded coverage promise.

The native development CLI now consumes validated mono little-endian `f32` PCM
and an explicit BCP 47 language tag through the public Rust API. Running the
pinned 10.56-second fixture with `transcribe-pcm` produced the unchanged final
oracle text on stdout. General compressed-media decoding remains a later,
backend-independent slice.

The same public Rust operation now crosses the thin Node-API boundary as an
asynchronous libuv task. The binding copies input bytes before returning to
JavaScript, maps `AbortSignal` to the Rust cancellation token, and returns only
plain result objects. A Node 24 host-level smoke reproduced the exact text,
`en_US`, 10,560 ms media duration, one segment, and 19 word records. Cancelling
an active task rejected with the stable `CANCELLED` error.
