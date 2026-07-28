# Reproducible Cuttledoc v3 release artifacts

## Status

- Priority: P1
- Effort: XL
- Risk: HIGH
- Issue: #28
- Depends on: #24, #26, and #27, all complete
- Planned at: `251c140`, 2026-07-28
- Working state at planning time: clean `main`, synchronized with `origin/main`
- Current state: in progress

## Why this matters

The product paths now work from source and the platform-specific package
harnesses prove compiler-free installation. They do not yet form a release:
there is no tag, release manifest, checksum set, signature, notarization,
SBOM, provenance attestation, Homebrew formula, or rollback exercise.

Issue #28 converts the existing package evidence into a CLI release-candidate
set whose identity starts at one source revision and remains verifiable through
download and installation. ADR-0018 moved the Rust implementation into the
permanent Cuttledoc product repository before release automation is finalized.
ADR-0019 removes public Node/npm artifacts from the initial release gate.

## Audited starting point

- `scripts/pack-cuttledoc-cli.sh` builds the complete macOS 26 arm64 CLI,
  including the Gemma/MLX runtime library and Metal library.
- `scripts/pack-cloud-artifacts.mjs` builds cloud-only CLI and Node artifacts
  on macOS arm64, Linux x64, and Windows x64.
- The packed-artifact harnesses have passed on macOS arm64, Linux x64, and
  Windows x64. They block compiler invocation during installation.
- The Node artifacts remain useful experimental regression evidence, but are
  not initial release payloads.
- All Rust crates currently set `publish = false`. No crates.io release is
  required for the v3 user installation path.
- The product repository retains the previous v1/v2 tags and releases. The Rust
  history has no v3 release tag.
- The only configured repository Actions secret at planning time is the
  unrelated hosted-transcription smoke credential. Apple Developer ID and
  notarization credentials are not configured.
- A local two-run diagnostic at `251c140` produced byte-identical npm tarballs
  but different CLI `tar.gz` digests. The CLI packers use `tar -czf` without
  normalizing entry or gzip metadata.

These observations are a time-bound baseline, not completed acceptance
evidence. Every release claim below is based on final downloaded artifacts.

## Decisions fixed for this issue

1. **One release identity.** The workspace version, tag, archive names, release
   manifest, and Homebrew formula version must agree. A release
   candidate uses a SemVer prerelease tag such as `v0.1.0-rc.1`; final tag
   selection happens only after a clean rehearsal.
2. **CLI-first publication.** The initial supported distribution consists of
   native CLI archives. The existing Node adapter remains experimental and is
   not published or assembled into the release (ADR-0019).
3. **FFmpeg remains a prerequisite.** ADR-0016 is the exact Phase 6 decision:
   release artifacts do not bundle or download FFmpeg. File transcription
   resolves an explicit path, `FFMPEG_PATH`, or `ffmpeg` on `PATH`; PCM input
   and hosted transcription do not require it. A managed FFmpeg build requires
   a future ADR and is not silently introduced here.
4. **Models remain out of application archives.** Managed model manifests
   publish immutable upstream revision, byte-size, and SHA-256 evidence.
   Model installation stays explicit and independently verified.
5. **Signing is layered.** Every published artifact gets a SHA-256 checksum and
   GitHub/Sigstore build-provenance attestation. Mach-O executables and dynamic
   libraries additionally receive Developer ID signatures, and the submitted
   macOS distribution is notarized before publication.
6. **Release jobs never publish implicitly.** Pull requests and ordinary
   pushes exercise an unsigned rehearsal. A protected manual/tag path assembles
   and verifies the candidate before a separate publication gate.
7. **Reproducibility excludes signatures and notarization tickets.** Unsigned
   payload archives must reproduce byte-for-byte for the same source, pinned
   toolchain, target, and build inputs. Signing timestamps and Apple
   notarization are verified against those recorded unsigned payload digests
   but are not expected to be byte-reproducible.

## Scope

In scope:

- deterministic native and cloud-only CLI archives;
- a schema-versioned release manifest and checksum file;
- source, upstream runtime, and model digest inventory;
- machine-readable SBOM and license inventory;
- Developer ID signing and Apple notarization automation;
- GitHub artifact provenance attestations and their verification;
- final-artifact macOS arm64, Linux x64, and Windows x64 smokes;
- unsupported-platform diagnostics;
- a Homebrew formula generated from the published macOS CLI archive;
- a documented and exercised release rollback;
- a product-repository release-candidate tag and GitHub prerelease.

Out of scope:

- Cuttledoc 2 deprecation or cache migration;
- publishing the internal Rust crates to crates.io;
- publishing the experimental Node adapter to npm;
- bundling or downloading FFmpeg;
- bundling model weights;
- making transcript enhancement mandatory;
- making TTS release-blocking;
- Intel macOS or macOS before 26.

## Release artifact contract

The final candidate contains:

| Artifact | Target and contents |
| --- | --- |
| `cuttledoc-VERSION-darwin-arm64.tar.gz` | Complete signed/notarized local-first CLI |
| `cuttledoc-VERSION-linux-x64.tar.gz` | Cloud-only CLI |
| `cuttledoc-VERSION-windows-x64.zip` | Cloud-only CLI |
| `SHA256SUMS` | Stable sorted checksums for every published payload and metadata file |
| `release-manifest.json` | Source/tag/toolchain/target/artifact identity and digests |
| `sbom.cdx.json` | CycloneDX software bill of materials |
| `licenses.json` | Machine-readable package/runtime/model license inventory |
| `THIRD-PARTY-NOTICES.md` | Human-readable license and attribution inventory |

GitHub retains signed provenance attestations for every payload plus the SBOM.
The release notes link the exact source revision, compatibility matrix,
FFmpeg prerequisite, model manifests, installation checks, and rollback.

## Verification matrix

| Gate | Command or evidence | Expected result |
| --- | --- | --- |
| Release contract | `node scripts/validate-release-artifacts.mjs --self-test` | Invalid names, versions, digests, ordering, and missing evidence are rejected |
| Deterministic CLI archive | package the unchanged payload twice | Both SHA-256 digests match |
| macOS full CLI | final archive smoke on `macos-26` arm64 | Compiler-free install and local capability checks pass |
| Linux cloud-only | final CLI archive on Linux x64 | Hosted capability works and local capabilities are deliberately absent |
| Windows cloud-only | final CLI archive on Windows x64 | Hosted capability works and local capabilities are deliberately absent |
| Dependency policy | `bash scripts/check-dependency-policy.sh` | Release inputs remain admitted |
| Workspace | `cargo test --workspace --locked` | Rust behavior remains green |
| Apple signature | `codesign --verify --deep --strict --verbose=2 PATH` | Every shipped Mach-O validates |
| Apple policy | `spctl --assess --type execute --verbose PATH` | Extracted CLI is accepted |
| Apple notarization | `xcrun notarytool` result and stapler/Gatekeeper verification | Accepted submission and verifiable ticket |
| Checksums | platform-native SHA-256 verification after download | Every published file matches `SHA256SUMS` |
| Provenance | `gh attestation verify ARTIFACT -R sebastian-software/cuttledoc` | Subject digest and workflow identity verify |
| Homebrew | install generated formula into a clean prefix | Formula downloads the exact release archive and runs `cuttledoc --version` |
| Rollback | install candidate, install preceding fixture release, restore candidate | Version and checksum checks pass at every transition |

## Ordered implementation

### 1. Establish deterministic unsigned release inputs

Add a repository-owned deterministic archive helper with fixed path ordering,
ownership, modes, and `SOURCE_DATE_EPOCH` handling. Route the CLI archive
packers through it and add a two-run digest test. Normalize the Windows format
as a deterministic ZIP rather than publishing a `tar.gz` with a misleading
platform convention.

Add a release metadata generator/validator that binds:

- workspace version;
- source commit and expected tag;
- target IDs and capability flavor;
- artifact filename, size, and SHA-256;
- exact Rust, Xcode, MLX, whisper.cpp, and adapter revisions;
- references to model manifests without copying model weights.

Verify the helper on the development host and in the existing package
workflows.

Implementation checkpoint (2026-07-28): a dependency-free Node USTAR/Gzip
writer now fixes entry ordering, ownership, file modes, gzip metadata, and
`SOURCE_DATE_EPOCH`. Both the complete macOS CLI harness and the portable
cloud-only harness package twice and require byte-identical output. The local
cloud-only macOS diagnostic now reproduces its 1,644,146-byte CLI archive.
Release metadata and the deterministic Windows ZIP convention remain open
within this step. The measured npm artifact remains non-release evidence.

### 2. Complete the final CLI matrix

Change platform jobs to upload one final native CLI archive for each supported
target. Run downloaded-archive smokes against the complete macOS local/hosted
artifact and the Linux/Windows cloud-only artifacts. Confirm that macOS gets
local and hosted capabilities while Linux and Windows expose only the explicit
hosted path.

### 3. Generate supply-chain inventories

Select and pin the SBOM generator, generate CycloneDX JSON from the locked Rust
graph, and validate it in CI. Generate a separate license inventory covering
Cargo packages, official MLX, whisper.cpp, repository-owned native adapters,
Apple system frameworks, and model manifests.

The inventory explicitly records that FFmpeg is an external prerequisite and
is not part of the distributed payload. Fail the build for missing licenses,
unknown sources, floating revisions, or payload files absent from the release
manifest.

### 4. Add Apple signing and notarization

Create scripts that can:

1. sign nested MLX/adapter dynamic libraries;
2. sign the CLI with hardened runtime and secure timestamps;
3. verify every signature before packaging;
4. submit the supported distribution container with `xcrun notarytool`;
5. record the accepted submission identifier without retaining credentials;
6. verify the downloaded/extracted artifact with `codesign`, `spctl`, and the
   notarization service/ticket.

The unsigned rehearsal remains runnable without credentials. The credentialed
job has an explicit preflight and cannot silently produce an unsigned release.

Stop before credentialed execution until the repository has a Developer ID
Application certificate plus notarization issuer/key/team configuration.
Secret values never enter arguments, logs, artifacts, or repository files.

### 5. Add attest-and-publish workflow

Add a manual release workflow that accepts an existing candidate tag, checks
that it identifies the workflow revision, builds each target once, assembles
metadata, verifies all final artifacts, and generates GitHub artifact
attestations. Publication runs only after every matrix and verification job
passes.

Use pinned action revisions and least-privilege permissions:
`contents: write`, `id-token: write`, and `attestations: write` only in the
jobs that require them. npm and crates.io publication remain separate future
decisions; this workflow publishes only the reviewed native CLI artifacts.

### 6. Add Homebrew and rollback evidence

Generate a formula from the published macOS archive version, URL, and digest.
Exercise it from a clean temporary tap/prefix. Document release withdrawal,
GitHub prerelease deletion/recreation rules, Homebrew formula reversal,
model-manifest rollback, and the rule that tags and already published versions
are never mutated.

Exercise rollback using two immutable local fixture releases until a real
preceding v3 candidate exists.

### 7. Run the release-candidate rehearsal

From a clean commit:

1. create the agreed prerelease tag;
2. run the unsigned reproducibility rehearsal twice;
3. run credentialed signing/notarization;
4. download rather than reuse all staged artifacts;
5. verify checksums, attestations, signatures, notarization, SBOM, licenses,
   clean installs, Homebrew, capabilities, and rollback;
6. publish the GitHub prerelease only after the downloaded-artifact gate;
7. record run URLs, artifact digests, Apple submission evidence, and residual
   limitations in this plan, `PLAN.md`, the compatibility matrix, and #28.

Do not close #28 on workflow configuration alone. Close it only after the
actual tagged rehearsal has passed.

## Stop and escalation conditions

- Stop publication if the source tree is dirty, the tag/version disagree, or
  a payload digest changes between assembly and verification.
- Stop rather than downgrade Apple signing if credentials are absent, expired,
  or rejected.
- Stop if signing changes runtime loading, entitlements, rpaths, or transcript
  behavior.
- Stop if SBOM or license generation cannot account for a shipped native or
  model-related component.
- Stop before bundling FFmpeg; that requires the review explicitly reserved by
  ADR-0016.
- Stop before publishing to npm, crates.io, or a permanent Homebrew tap; those
  are separate publication decisions.

## Drift log

- 2026-07-28: planning snapshot created at `251c140`.
- 2026-07-28: local repeated packaging established that npm output is already
  byte-identical while the CLI gzip archive is not. Step 1 owns the gap.
- 2026-07-28: repository secret-name audit found no Apple signing or
  notarization credentials. Credential-independent work proceeds first.
- 2026-07-28: deterministic USTAR/Gzip generation and two-run package gates
  close the observed CLI archive metadata gap on the local cloud-only path.
- 2026-07-28: ADR-0018 moves the work to the permanent product repository and
  ADR-0019 narrows the first release to native CLI artifacts.
