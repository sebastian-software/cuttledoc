import { execFileSync, spawnSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"

const packageName = process.argv[2]
const dryRun = process.argv.includes("--dry-run")
const noProvenance = process.argv.includes("--no-provenance")

if (!packageName) {
  throw new Error("Usage: publish-package-if-needed.mjs <package-name> [--dry-run] [--no-provenance]")
}

const packagesUrl = new URL("../packages/", import.meta.url)
let manifest

for (const entry of await readdir(packagesUrl, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  let candidate
  try {
    candidate = JSON.parse(await readFile(new URL(`${entry.name}/package.json`, packagesUrl), "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") continue
    throw error
  }

  if (candidate.name === packageName) {
    manifest = candidate
    break
  }
}

if (!manifest) {
  throw new Error(`Unknown workspace package: ${packageName}`)
}
if (manifest.private === true) {
  throw new Error(`Refusing to publish private package: ${packageName}`)
}

const versionSpec = `${manifest.name}@${manifest.version}`
const lookup = spawnSync("npm", ["view", versionSpec, "version"], {
  stdio: "ignore"
})

if (lookup.error) throw lookup.error
if (lookup.status === 0) {
  console.log(`${versionSpec} is already published; skipping.`)
  process.exit(0)
}

const publishArgs = ["--filter", manifest.name, "publish", "--access", "public", "--no-git-checks"]
if (!noProvenance) publishArgs.push("--provenance")
if (dryRun) publishArgs.push("--dry-run")

execFileSync("pnpm", publishArgs, { stdio: "inherit" })
