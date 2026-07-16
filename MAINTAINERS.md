# Maintainers

This document lists the maintainers of cuttledoc and describes how the project is governed.

## Current Maintainers

- **Sebastian Werner** ([@sebastian-software](https://github.com/sebastian-software))
  - Email: s.werner@sebastian-software.de
  - Website: https://sebastian-software.de
  - Primary maintainer and project lead

## Governance

cuttledoc is currently maintained by Sebastian Software GmbH. The project follows a benevolent dictator model where the primary maintainer makes final decisions on:

- Feature additions and removals
- Architecture changes
- Release planning
- Code review and merging

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

All contributions are reviewed by maintainers before merging. We aim to respond to pull requests within 48 hours.

## Decision Making

Significant architectural decisions are documented as [Architecture Decision Records](docs/decisions/) (ADRs).

For major changes:

1. Open an issue for discussion
2. Propose the change with rationale
3. Gather community feedback
4. Document the accepted decision in the [ADR collection](docs/decisions/)

## Release Process

Releases are managed using [release-it](https://github.com/release-it/release-it) with conventional commits. The changelog is automatically generated from commit messages.

### GitHub release workflow

The preferred release path is the manually dispatched
[`release.yml`](.github/workflows/release.yml) workflow. It runs the complete
lint, typecheck, test, and build suite before `release-it` creates the release
commit and tag, publishes `cuttledoc`, and creates the GitHub release. Dry run
is enabled by default.

Publishing uses npm Trusted Publishing (OIDC), not a stored npm token, and
includes a verifiable provenance attestation. Configure the `cuttledoc` package
on npm with these exact values before the first release:

- Provider: GitHub Actions
- Organization or user: `sebastian-software`
- Repository: `cuttledoc`
- Workflow filename: `release.yml`
- Environment: `release`
- Allowed action: `npm publish`

The `release` GitHub environment should require a maintainer approval. The two
runtime workspace packages, `@cuttledoc/ffmpeg` and `@cuttledoc/llm`, must also
exist at their locally referenced versions before publishing `cuttledoc`; the
workflow verifies this and fails before changing release state otherwise.

To release, open **Actions → Release → Run workflow**, leave `dry_run` enabled
for the first run, and enter a semantic increment (`patch`, `minor`, `major`) or
an exact version. After reviewing the dry run, run the same input with `dry_run`
disabled.

### Local fallback

`pnpm release` is an interactive fallback and uses npm's normal authentication
and 2FA prompt. It has no 1Password dependency. A maintainer who keeps npm OTPs
in 1Password can still opt in without making it a project requirement:

```bash
pnpm release --npm.otp="$(op item get npmjs --otp)"
```

## Contact

For questions about maintenance or governance, contact: **s.werner@sebastian-software.de**
