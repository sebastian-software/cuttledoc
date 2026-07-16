import { readFile } from "node:fs/promises"

const rootLicense = await readFile(new URL("../LICENSE", import.meta.url), "utf8")
const packageDirectories = ["packages/cuttledoc", "packages/ffmpeg", "packages/llm"]

for (const directory of packageDirectories) {
  const packageUrl = new URL(`../${directory}/`, import.meta.url)
  const packageLicense = await readFile(new URL("LICENSE", packageUrl), "utf8")
  if (packageLicense !== rootLicense) {
    throw new Error(`${directory}/LICENSE must match the root LICENSE`)
  }

  const manifest = JSON.parse(await readFile(new URL("package.json", packageUrl), "utf8"))
  if (!manifest.files?.includes("LICENSE")) {
    throw new Error(`${directory}/package.json must publish LICENSE`)
  }
}

console.log(`Verified LICENSE files for ${packageDirectories.length} publishable packages.`)
