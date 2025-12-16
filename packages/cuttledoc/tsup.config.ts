import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "llm/index": "src/llm/index.ts",
    cli: "src/cli/index.ts"
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node22",
  treeshake: true,
  splitting: false,
  external: ["sherpa-onnx-node"]
})

