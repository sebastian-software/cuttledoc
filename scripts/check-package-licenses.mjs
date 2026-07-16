import { readdir, readFile } from "node:fs/promises"

const rootLicense = await readFile(new URL("../LICENSE", import.meta.url), "utf8")
const packagesUrl = new URL("../packages/", import.meta.url)
const packages = []

for (const entry of await readdir(packagesUrl, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const directory = `packages/${entry.name}`
  const packageUrl = new URL(`${entry.name}/`, packagesUrl)
  const manifest = JSON.parse(await readFile(new URL("package.json", packageUrl), "utf8"))
  if (manifest.private === true) continue

  packages.push({ directory, manifest, packageUrl })
}

for (const { directory, manifest, packageUrl } of packages) {
  const packageLicense = await readFile(new URL("LICENSE", packageUrl), "utf8")
  if (packageLicense !== rootLicense) {
    throw new Error(`${directory}/LICENSE must match the root LICENSE`)
  }

  if (!manifest.files?.includes("LICENSE")) {
    throw new Error(`${directory}/package.json must publish LICENSE`)
  }
}

console.log(`Verified LICENSE files for ${packages.length} publishable packages.`)
