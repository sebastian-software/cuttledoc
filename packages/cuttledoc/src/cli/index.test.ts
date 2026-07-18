import { beforeEach, describe, expect, it, vi } from "vitest"

// Keep the transcribe pipeline off the real backends: existsSync always passes
// and transcribe returns a fixed transcript so we can assert on the output streams.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return { ...actual, existsSync: vi.fn(() => true) }
})

vi.mock("../index.js", () => ({
  transcribe: vi.fn(() =>
    Promise.resolve({
      text: "hello world transcript",
      durationSeconds: 1,
      backend: "parakeet"
    })
  )
}))

import { parseArgs } from "./args.js"
import { handleTranscribeCommand } from "./index.js"

// Silence and capture the output streams. stdout = console.log, stderr = console.error.
const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

/** Join a spy's calls into a single string, mirroring what a pipe would capture. */
function joined(spy: typeof logSpy): string {
  return spy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n")
}

describe("handleTranscribeCommand output streams", () => {
  beforeEach(() => {
    logSpy.mockClear()
    errSpy.mockClear()
  })

  it("quiet mode: stdout contains only the transcript", async () => {
    // --no-correct skips the LLM stage; -q requests minimal output.
    const args = parseArgs(["audio.mp3", "-q", "--no-correct"])
    await handleTranscribeCommand(args)

    expect(joined(logSpy)).toBe("hello world transcript")
    // No status lines leaked onto stdout.
    expect(joined(logSpy)).not.toContain("Transcribing")
    expect(joined(logSpy)).not.toContain("Backend")
  })

  it("normal mode: status goes to stderr, keeping stdout pipeable", async () => {
    const args = parseArgs(["audio.mp3", "--no-correct"])
    await handleTranscribeCommand(args)

    const stdout = joined(logSpy)
    const stderr = joined(errSpy)

    expect(stdout).toContain("hello world transcript")
    expect(stdout).not.toContain("Transcribing:")
    expect(stdout).not.toContain("Backend:")
    expect(stderr).toContain("Transcribing:")
    expect(stderr).toContain("Backend:")
  })
})
