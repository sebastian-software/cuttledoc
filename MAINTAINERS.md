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

Releases are managed using [Release Please](https://github.com/googleapis/release-please)
with conventional commits. Release Please maintains the package version and
changelog in a release pull request.

### GitHub release workflow

The [`publish.yml`](.github/workflows/publish.yml) workflow runs on every push
to `main`. Release Please opens or updates a release pull request containing the
next version and changelog. Merging that pull request creates the version tag
and GitHub release; the same workflow then runs the complete lint, typecheck,
test, and build suite before publishing `cuttledoc` to npm.

Publishing uses npm Trusted Publishing (OIDC), not a stored npm token, and
includes a verifiable provenance attestation. Configure `cuttledoc`,
`@cuttledoc/ffmpeg`, and `@cuttledoc/llm` on npm with these exact values before
the first automated release:

- Provider: GitHub Actions
- Organization or user: `sebastian-software`
- Repository: `cuttledoc`
- Workflow filename: `publish.yml`
- Environment: _(none)_
- Allowed action: `npm publish`

The scoped runtime packages must be bootstrapped once with normal npm
authentication before Trusted Publishing can be configured for them:

```bash
npm login
node scripts/publish-package-if-needed.mjs @cuttledoc/ffmpeg --no-provenance
node scripts/publish-package-if-needed.mjs @cuttledoc/llm --no-provenance
```

Afterward, configure the Trusted Publisher values above for both packages.

The three packages share one product version. Release Please updates all three
manifests, and the workflow publishes the two runtime dependencies before
`cuttledoc`. A recovery run safely skips package versions that already exist on
npm.

Review and merge the Release Please pull request when its proposed version and
changelog are ready. The publish job uses npm Trusted Publishing (OIDC), so no
long-lived npm token is required. If publishing fails after the GitHub release
was created, rerun the failed job or dispatch **Release & Publish** with
`force_publish` enabled after resolving the problem.

## Contact

For questions about maintenance or governance, contact: **s.werner@sebastian-software.de**
