#!/usr/bin/env node
/**
 * CLI wrapper that sets up library paths for sherpa-onnx native module.
 *
 * On macOS/Linux, DYLD_LIBRARY_PATH/LD_LIBRARY_PATH must be set before
 * Node.js starts to find the sherpa-onnx dynamic libraries.
 */

import { spawn } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { platform, arch } from "node:os"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Find the sherpa-onnx native addon directory
 */
function findSherpaAddonPath() {
  const platformArch = `${platform() === "win32" ? "win" : platform()}-${arch()}`
  const addonName = `sherpa-onnx-${platformArch}`

  // Check various possible locations
  const baseDir = resolve(__dirname, "..")
  const locations = [
    // Direct in node_modules (npm/yarn or pnpm symlink)
    join(baseDir, "node_modules", addonName),
    // pnpm .pnpm directory structure
    join(baseDir, "node_modules", ".pnpm"),
    // Workspace root node_modules
    join(baseDir, "..", "..", "node_modules", addonName),
    join(baseDir, "..", "..", "node_modules", ".pnpm")
  ]

  for (const loc of locations) {
    if (!existsSync(loc)) continue

    // If it's the .pnpm directory, search for the addon package
    if (loc.endsWith(".pnpm")) {
      try {
        const entries = readdirSync(loc)
        for (const entry of entries) {
          if (entry.startsWith(`${addonName}@`)) {
            const fullPath = join(loc, entry, "node_modules", addonName)
            if (existsSync(join(fullPath, "sherpa-onnx.node"))) {
              return fullPath
            }
          }
          // Also check sherpa-onnx-node entries that may contain the platform package
          if (entry.startsWith("sherpa-onnx-node@")) {
            const fullPath = join(loc, entry, "node_modules", addonName)
            if (existsSync(join(fullPath, "sherpa-onnx.node"))) {
              return fullPath
            }
          }
        }
      } catch {
        // Ignore errors
      }
    } else if (existsSync(join(loc, "sherpa-onnx.node"))) {
      return loc
    }
  }

  return null
}

const args = process.argv.slice(2)

// Check if we need to set library paths (macOS/Linux)
if (platform() === "darwin" || platform() === "linux") {
  const addonPath = findSherpaAddonPath()
  const envVar = platform() === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH"

  if (addonPath) {
    const currentPath = process.env[envVar] || ""
    if (!currentPath.includes(addonPath)) {
      // Spawn the actual CLI with the library path set
      const cliPath = resolve(__dirname, "..", "dist", "cli.cjs")
      const env = {
        ...process.env,
        [envVar]: addonPath + (currentPath ? `:${currentPath}` : ""),
        // Also help sherpa-onnx-node find its native module
        SHERPA_ONNX_ADDON_PATH: addonPath
      }

      const child = spawn(process.execPath, [cliPath, ...args], {
        env,
        stdio: "inherit"
      })

      child.on("exit", (code) => {
        process.exit(code ?? 0)
      })

      // Don't continue, the spawned process handles everything
      await new Promise(() => {})
    }
  }
}

// Library path already set or not needed, run directly
await import("../dist/cli.cjs")
