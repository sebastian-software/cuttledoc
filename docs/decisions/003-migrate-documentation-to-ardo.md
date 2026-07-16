# ADR-003: Migrate documentation from Fumadocs to ARDO

**Date:** 2026-07-16
**Status:** Accepted
**Authors:** Sebastian Werner

## Context

The documentation application used Fumadocs on top of React Router and maintained its own route
discovery, static search endpoint, SEO-file generator, canonical metadata helper, and GitHub Pages
output-flattening steps. Sebastian Software's other open-source projects share ARDO for this work.

The public inventory before migration was:

- `/` for the product landing page;
- `/docs` plus `/docs/cli`, `/docs/backends`, `/docs/models`, `/docs/llm`,
  `/docs/benchmarks`, and `/docs/troubleshooting`;
- `/docs/api` for the hand-maintained TypeScript API reference;
- `sitemap.xml`, `robots.txt`, `og-image.png`, favicon assets, offline search, and a GitHub Pages
  `404.html` fallback;
- deployment at `https://sebastian-software.github.io/cuttledoc/`.

No URL or content gap requires a redirect.

## Decision

Adopt ARDO 4.2.0 using its monorepo and GitHub Pages reference projects. Documentation sources move
to `packages/docs/app/routes/docs/`, retaining every established route and the existing handwritten
API reference. ARDO owns route and sidebar generation, MiniSearch, Shiki, internal-link checking,
sitemap, robots.txt, favicons, and GitHub Pages output flattening.

ARDO 4.2.0 does not emit its generated MDX `meta` export when combined with the repository's React
Router 8.2 build pipeline. Until that upstream ordering gap is resolved, each route explicitly
exports metadata through the shared `app/seo.ts` helper. ARDO's configured site identity and social
defaults remain aligned with that helper.

The custom landing page remains a React route so its existing product content can be preserved.
The only post-build compatibility step creates the GitHub Pages `404.html` fallback needed for
unknown static paths; ARDO supplies the rendered error boundary.

## Consequences

- Root commands `pnpm docs:dev` and `pnpm docs:build` keep their existing contract.
- Public content and URLs remain unchanged, so no redirect map is introduced.
- Fumadocs dependencies, generated collections, the search API route, and custom SEO/flattening
  scripts are removed.
- The small route metadata bridge remains necessary to preserve canonical and social tags with
  ARDO 4.2.0; it can be removed after an ARDO upgrade proves generated MDX metadata in the build.
- ARDO's generated `app/routes.ts` is ignored and must not be edited by hand.
- Build verification covers every public route, SEO files, offline search, social artwork, icons,
  and the Pages fallback.
