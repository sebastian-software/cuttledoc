# cuttledoc documentation

This package contains the public cuttledoc documentation site, built with
React Router and Fumadocs and deployed to GitHub Pages.

From the repository root, install dependencies and start the development
server:

```bash
pnpm install
pnpm docs:dev
```

Useful verification commands:

```bash
pnpm docs:build
pnpm --filter @cuttledoc/docs test
pnpm --filter @cuttledoc/docs types:check
```
