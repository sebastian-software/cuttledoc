#!/usr/bin/env node
/**
 * CLI entry point for cuttledoc.
 *
 * This is a simple wrapper that loads the compiled CLI module.
 * Native CoreML addons are loaded automatically by parakeet-coreml and whisper-coreml.
 */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load the CLI module
await import(resolve(__dirname, "..", "dist", "cli.cjs"))
