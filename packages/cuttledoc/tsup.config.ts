import { readFileSync } from "node:fs"

import { defineConfig } from "tsup"

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string
}
const versionDefine = {
  __CUTTLEDOC_VERSION__: JSON.stringify(packageJson.version)
}

export default defineConfig([
  {
    entry: {
      index: "src/index.ts"
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node22",
    treeshake: true,
    splitting: false,
    define: versionDefine,
    // Native addons are bundled with their packages
    external: ["parakeet-coreml", "whisper-coreml", "@cuttledoc/llm"]
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
    define: versionDefine,
    external: ["parakeet-coreml", "whisper-coreml", "@cuttledoc/llm"]
  }
])
