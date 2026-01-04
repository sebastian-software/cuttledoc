import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "llm/index": "src/llm/index.ts"
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node22",
    treeshake: true,
    splitting: false,
    // Native addons are bundled with their packages
    external: ["parakeet-coreml", "whisper-coreml"]
  },
  {
    entry: {
      cli: "src/cli/index.ts"
    },
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    target: "node22",
    treeshake: true,
    external: ["parakeet-coreml", "whisper-coreml"]
  }
])
