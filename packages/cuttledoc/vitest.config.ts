import { readFileSync } from "node:fs"

import { defineConfig } from "vitest/config"

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string
}

export default defineConfig({
  define: {
    __CUTTLEDOC_VERSION__: JSON.stringify(packageJson.version)
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        // Test files
        "src/**/*.test.ts",

        // CLI entry point - integration test territory (process.exit, console I/O)
        "src/cli/index.ts",

        // Native backends - require actual native modules (parakeet-coreml, whisper-coreml)
        "src/backends/**"
      ]
    }
  }
})
