import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import test from "node:test"
import {
  BINARIES,
  commitInstall,
  downloadFile,
  extractExecutable,
  findExecutableEntry,
  getInstallMarker,
  isCurrentInstall
} from "./install.js"

function withTempDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "cuttledoc-ffmpeg-test-"))
  t.after(() => rmSync(directory, { force: true, recursive: true }))
  return directory
}

test("pins a SHA-256 digest for every supported release asset", () => {
  const assets = Object.values(BINARIES).flatMap((platform) => Object.values(platform))

  assert.equal(assets.length, 6)
  for (const asset of assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/)
    assert.match(asset.filename, /^ffmpeg-v8\.0-/)
  }
})

test("downloadFile writes content only when its checksum matches", async (t) => {
  const directory = withTempDirectory(t)
  const destination = join(directory, "archive.zip")
  const content = Buffer.from("verified archive")
  const checksum = createHash("sha256").update(content).digest("hex")

  await downloadFile("https://example.test/archive.zip", destination, checksum, {
    fetchImpl: async () => new Response(content),
    showProgress: false
  })

  assert.deepEqual(readFileSync(destination), content)
})

test("downloadFile removes a download with a mismatched checksum", async (t) => {
  const directory = withTempDirectory(t)
  const destination = join(directory, "archive.zip")

  await assert.rejects(
    downloadFile("https://example.test/archive.zip", destination, "0".repeat(64), {
      fetchImpl: async () => new Response("tampered archive"),
      showProgress: false
    }),
    /Checksum mismatch/
  )

  assert.equal(existsSync(destination), false)
})

test("downloadFile reports downloaded bytes when content length is unavailable", async (t) => {
  const directory = withTempDirectory(t)
  const destination = join(directory, "archive.zip")
  const content = Buffer.from("archive without a content-length header")
  const checksum = createHash("sha256").update(content).digest("hex")
  const progress = []

  await downloadFile("https://example.test/archive.zip", destination, checksum, {
    fetchImpl: async () => new Response(content),
    showProgress: true,
    progressWriter: (message) => progress.push(message)
  })

  assert.match(progress.join(""), /Downloading\.\.\. 1 KiB/)
  assert.equal(progress.at(-1), "\n")
})

test("findExecutableEntry ignores directories and earlier unrelated entries", () => {
  const expected = { path: "bin/ffmpeg", type: "File" }
  const files = [
    { path: "LICENSE", type: "File" },
    { path: "ffmpeg", type: "Directory" },
    expected,
    { path: "bin/ffprobe", type: "File" }
  ]

  assert.equal(findExecutableEntry(files, "ffmpeg"), expected)
})

test("findExecutableEntry rejects missing or ambiguous executable entries", () => {
  assert.throws(() => findExecutableEntry([], "ffmpeg"), /found 0/)
  assert.throws(
    () =>
      findExecutableEntry(
        [
          { path: "ffmpeg", type: "File" },
          { path: "nested/ffmpeg", type: "File" }
        ],
        "ffmpeg"
      ),
    /found 2/
  )
})

test("extractExecutable streams the matched entry to a temporary path", async (t) => {
  const directory = withTempDirectory(t)
  const destination = join(directory, "ffmpeg.tmp")
  const content = Buffer.from("executable")
  const archive = {
    files: [
      { path: "LICENSE", type: "File", stream: () => Readable.from("license") },
      { path: "nested/ffmpeg", type: "File", stream: () => Readable.from(content) }
    ]
  }

  await extractExecutable(archive, "ffmpeg", destination)

  assert.deepEqual(readFileSync(destination), content)
})

test("isCurrentInstall requires a matching marker and a runnable binary", (t) => {
  const directory = withTempDirectory(t)
  const executablePath = join(directory, "ffmpeg")
  const markerPath = join(directory, ".ffmpeg-install")
  const marker = getInstallMarker(BINARIES.darwin.arm64)
  let validationCalls = 0

  writeFileSync(executablePath, "binary")
  writeFileSync(markerPath, marker)

  const valid = () => {
    validationCalls += 1
    return true
  }

  assert.equal(isCurrentInstall(executablePath, markerPath, marker, valid), true)
  assert.equal(validationCalls, 1)

  writeFileSync(markerPath, "old version")
  assert.equal(isCurrentInstall(executablePath, markerPath, marker, valid), false)
  assert.equal(validationCalls, 1)

  writeFileSync(markerPath, marker)
  assert.equal(
    isCurrentInstall(executablePath, markerPath, marker, () => false),
    false
  )
})

test("commitInstall rolls back final paths when the marker rename fails", () => {
  const renames = []
  const removals = []

  assert.throws(
    () =>
      commitInstall("ffmpeg.tmp", "ffmpeg", "marker.tmp", "marker", "v8.0", {
        writeFile: () => {},
        rename: (source, destination) => {
          renames.push([source, destination])
          if (destination === "marker") {
            throw new Error("marker commit failed")
          }
        },
        remove: (path, options) => removals.push([path, options])
      }),
    /marker commit failed/
  )

  assert.deepEqual(renames, [
    ["ffmpeg.tmp", "ffmpeg"],
    ["marker.tmp", "marker"]
  ])
  assert.deepEqual(removals, [
    ["ffmpeg", { force: true }],
    ["marker", { force: true }]
  ])
})

test("commitInstall preserves final paths when marker staging fails before the binary rename", () => {
  const removals = []

  assert.throws(
    () =>
      commitInstall("ffmpeg.tmp", "ffmpeg", "marker.tmp", "marker", "v8.0", {
        writeFile: () => {
          throw new Error("marker staging failed")
        },
        rename: () => assert.fail("rename should not be called"),
        remove: (path) => removals.push(path)
      }),
    /marker staging failed/
  )

  assert.deepEqual(removals, [])
})
