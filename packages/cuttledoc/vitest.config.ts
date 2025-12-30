import { defineConfig } from "vitest/config"

export default defineConfig({
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

        // Entry points - mostly re-exports and backend orchestration
        "src/index.ts",
        "src/llm/index.ts",

        // Native backends - require actual native modules (sherpa-onnx, apple bindings)
        "src/backends/**",

        // LLM processor - requires llama.cpp native bindings and model files
        "src/llm/processor.ts",

        // Audio utils - requires FFmpeg native bindings
        "src/utils/audio.ts"
      ]
    }
  }
})
