# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting significant technical decisions made during the development of cuttledoc.

## Why ADRs?

> "Code can be deleted, knowledge should not be lost."

ADRs preserve the context, reasoning, and trade-offs behind major decisions. They help future maintainers understand:

- What alternatives were considered
- Why certain approaches were chosen
- What challenges were encountered
- When to reconsider past decisions

## Decisions

| ID                                         | Title                                                | Date       | Status   |
| ------------------------------------------ | ---------------------------------------------------- | ---------- | -------- |
| [001](./001-remove-python-asr-backends.md) | Removal of Python-based ASR Backends (Phi-4, Canary) | 2025-01-01 | Accepted |

## Template

When adding new ADRs, use this structure:

```markdown
# ADR-XXX: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded
**Authors:** Name

## Context

What is the issue that we're seeing that is motivating this decision?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult because of this change?
```

## Archive Branches

Major removals are preserved in archive branches:

| Branch                                | Content                       | Date    |
| ------------------------------------- | ----------------------------- | ------- |
| `archive/python-asr-backends-2025-01` | Phi-4 & Canary implementation | 2025-01 |
