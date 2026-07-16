# cuttledoc documentation

The public cuttledoc documentation site is built with [ARDO](https://ardo-docs.dev) and deployed
as a static React Router application to GitHub Pages.

Documentation pages live in `app/routes/docs/`. ARDO derives routes, navigation, offline search,
syntax highlighting, canonical metadata, sitemap, robots.txt, and favicons from those sources and
the configuration in `vite.config.ts`.

From the repository root:

```bash
pnpm install
pnpm docs:dev
pnpm docs:build
```

Useful verification commands:

```bash
pnpm --filter @cuttledoc/docs test
pnpm --filter @cuttledoc/docs types:check
pnpm --filter @cuttledoc/docs lint
```

The production build is written to `build/client/`. The build also writes the GitHub Pages SPA
fallback required to render ARDO's custom 404 page for unknown URLs.
