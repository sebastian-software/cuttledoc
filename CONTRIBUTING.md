# Contributing to cuttledoc

First off, thanks for taking the time to contribute! 🎉

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Describe the behavior you observed and what you expected**
- **Include your environment details** (OS, Node.js version, backend used)
- **Include any relevant logs or error messages**

### Suggesting Features

Feature suggestions are welcome! Please open an issue with:

- **A clear and descriptive title**
- **A detailed description of the proposed feature**
- **Why this feature would be useful**
- **Possible implementation approach** (if you have ideas)

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Follow the setup instructions below
3. Make your changes
4. Ensure tests pass (`pnpm test`)
5. Ensure linting passes (`pnpm lint`)
6. Write clear commit messages following [Conventional Commits](https://www.conventionalcommits.org/)
7. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- macOS 14+ (for Apple Speech backend development)

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/cuttledoc.git
cd cuttledoc

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start docs dev server
pnpm docs:dev
```

### Project Structure

```
cuttledoc/
├── packages/
│   ├── cuttledoc/     # Core library + CLI
│   │   ├── src/
│   │   │   ├── backends/    # Speech recognition backends
│   │   │   ├── cli/         # CLI implementation
│   │   │   ├── llm/         # LLM enhancement
│   │   │   └── utils/       # Shared utilities
│   │   └── ...
│   └── docs/          # Documentation website
└── ...
```

### Development Commands

```bash
# Build specific package
pnpm --filter cuttledoc build

# Watch mode for development
pnpm --filter cuttledoc dev

# Run tests in watch mode
pnpm --filter cuttledoc test:watch

# Lint and fix
pnpm lint:fix

# Type check
pnpm typecheck
```

### Coding Standards

- **TypeScript**: All code must be written in TypeScript
- **Formatting**: Use Prettier (runs automatically on commit)
- **Linting**: ESLint must pass
- **Tests**: Add tests for new functionality
- **Comments**: Document non-obvious code, avoid commenting obvious things

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new parakeet model support
fix: resolve audio extraction on Windows
docs: update API reference
perf: optimize model loading time
chore: update dependencies
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter cuttledoc test

# Run tests in watch mode
pnpm --filter cuttledoc test:watch
```

### Adding a New Backend

1. Create a new directory under `packages/cuttledoc/src/backends/`
2. Implement the `TranscriptionBackend` interface
3. Add the backend to `packages/cuttledoc/src/backend.ts`
4. Add tests
5. Update documentation

## Questions?

Feel free to open an issue with the `question` label or start a discussion.

Thank you for contributing! 🐙
