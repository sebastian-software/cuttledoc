import { downloadModel, LOCAL_MODELS } from "../dist/index.js"

const models = Object.keys(LOCAL_MODELS)

async function main() {
  console.log(`Downloading ${models.length} GGUF models...\n`)

  for (const modelId of models) {
    console.log(`📥 Downloading ${modelId}...`)
    try {
      const path = await downloadModel(modelId, {
        onProgress: (p) => process.stdout.write(`\r  Progress: ${(p * 100).toFixed(1)}%`)
      })
      console.log(`\n  ✅ Done: ${path}\n`)
    } catch (e) {
      console.error(`\n  ❌ Failed: ${e}\n`)
    }
  }

  console.log("✅ All downloads complete!")
}

main()
