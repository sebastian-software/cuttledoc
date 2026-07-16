import { readFileSync } from "node:fs"

const workspaceFile = readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8")
const lockfile = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")

const exclusionBlock = workspaceFile.match(/^minimumReleaseAgeExclude:\n((?:  - .+\n?)+)/m)?.[1]

if (exclusionBlock === undefined) {
  process.exit(0)
}

const exclusions = exclusionBlock
  .trimEnd()
  .split("\n")
  .map((line) => JSON.parse(line.replace(/^  - /, "")))

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const staleExclusions = exclusions.filter((selector) => {
  const packageEntry = new RegExp(`^  ['\"]?${escapeRegExp(selector)}['\"]?:$`, "m")
  return !packageEntry.test(lockfile)
})

if (staleExclusions.length > 0) {
  console.error(
    "Remove stale minimumReleaseAgeExclude entries that are no longer present in pnpm-lock.yaml:\n" +
      staleExclusions.map((selector) => `- ${selector}`).join("\n")
  )
  process.exit(1)
}

console.log(`Verified ${exclusions.length} pnpm maturity-policy exclusions against the lockfile.`)
