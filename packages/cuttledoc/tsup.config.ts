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
    external: ["sherpa-onnx-node"]
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
    external: ["sherpa-onnx-node"]
  }
])
