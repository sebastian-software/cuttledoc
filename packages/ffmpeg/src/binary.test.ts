import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  platform: vi.fn(() => "linux"),
  arch: vi.fn(() => "x64")
}))

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync
}))

vi.mock("node:os", () => ({
  platform: mocks.platform,
  arch: mocks.arch
}))

import { ffmpegPath, isFFmpegAvailable } from "./binary.js"

const originalFFmpegPath = process.env.FFMPEG_PATH
const moduleDirectory = dirname(fileURLToPath(import.meta.resolve("./binary.js")))
const bundledPath = resolve(moduleDirectory, "..", "binary", "ffmpeg")

describe("FFmpeg path resolution", () => {
  beforeEach(() => {
    delete process.env.FFMPEG_PATH
    mocks.existsSync.mockReset()
    mocks.platform.mockReset().mockReturnValue("linux")
    mocks.arch.mockReset().mockReturnValue("x64")
  })

  afterEach(() => {
    if (originalFFmpegPath === undefined) {
      delete process.env.FFMPEG_PATH
    } else {
      process.env.FFMPEG_PATH = originalFFmpegPath
    }
  })

  it("prefers a valid FFMPEG_PATH over the bundled binary", () => {
    process.env.FFMPEG_PATH = "./custom/ffmpeg"
    const configuredPath = resolve("./custom/ffmpeg")
    mocks.existsSync.mockReturnValue(true)

    expect(ffmpegPath()).toBe(configuredPath)
    expect(isFFmpegAvailable()).toBe(true)
    expect(mocks.existsSync).toHaveBeenNthCalledWith(1, configuredPath)
    expect(mocks.existsSync).toHaveBeenNthCalledWith(2, configuredPath)
    expect(mocks.platform).not.toHaveBeenCalled()
  })

  it("falls back to the bundled binary when FFMPEG_PATH is missing", () => {
    mocks.existsSync.mockImplementation((path) => path === bundledPath)

    expect(ffmpegPath()).toBe(bundledPath)
    expect(isFFmpegAvailable()).toBe(true)
  })

  it("falls back to the bundled binary when FFMPEG_PATH does not exist", () => {
    process.env.FFMPEG_PATH = "./missing/ffmpeg"
    const configuredPath = resolve("./missing/ffmpeg")
    mocks.existsSync.mockImplementation((path) => path === bundledPath)

    expect(ffmpegPath()).toBe(bundledPath)
    expect(mocks.existsSync).toHaveBeenNthCalledWith(1, configuredPath)
    expect(mocks.existsSync).toHaveBeenNthCalledWith(2, bundledPath)
  })

  it("uses a valid FFMPEG_PATH without consulting platform support", () => {
    process.env.FFMPEG_PATH = "/opt/ffmpeg"
    mocks.existsSync.mockReturnValue(true)
    mocks.platform.mockReturnValue("freebsd")

    expect(ffmpegPath()).toBe(resolve("/opt/ffmpeg"))
    expect(isFFmpegAvailable()).toBe(true)
    expect(mocks.platform).not.toHaveBeenCalled()
  })

  it("reports only the configured path when the platform is unsupported", () => {
    process.env.FFMPEG_PATH = "./missing/ffmpeg"
    const configuredPath = resolve("./missing/ffmpeg")
    mocks.existsSync.mockReturnValue(false)
    mocks.platform.mockReturnValue("freebsd")

    expect(() => ffmpegPath()).toThrow(
      `FFmpeg binary not found. Checked: ${configuredPath}. ` +
        "Set FFMPEG_PATH to an FFmpeg executable or reinstall @cuttledoc/ffmpeg."
    )
    expect(mocks.platform).toHaveBeenCalledOnce()
    expect(mocks.existsSync).toHaveBeenCalledOnce()
    expect(mocks.existsSync).toHaveBeenCalledWith(configuredPath)
  })

  it("reports every attempted path when no binary is available", () => {
    process.env.FFMPEG_PATH = "./missing/ffmpeg"
    const configuredPath = resolve("./missing/ffmpeg")
    mocks.existsSync.mockReturnValue(false)

    expect(() => ffmpegPath()).toThrow(
      `FFmpeg binary not found. Checked: ${configuredPath}, ${bundledPath}. ` +
        "Set FFMPEG_PATH to an FFmpeg executable or reinstall @cuttledoc/ffmpeg."
    )
    expect(isFFmpegAvailable()).toBe(false)
  })

  it("reports the paths captured during resolution when the environment changes", () => {
    process.env.FFMPEG_PATH = "./first/ffmpeg"
    const configuredPath = resolve("./first/ffmpeg")
    const changedPath = resolve("./changed/ffmpeg")
    mocks.existsSync.mockImplementationOnce(() => {
      process.env.FFMPEG_PATH = "./changed/ffmpeg"
      return false
    })
    mocks.existsSync.mockReturnValueOnce(false)

    expect(() => ffmpegPath()).toThrow(
      `FFmpeg binary not found. Checked: ${configuredPath}, ${bundledPath}. ` +
        "Set FFMPEG_PATH to an FFmpeg executable or reinstall @cuttledoc/ffmpeg."
    )
    expect(() => ffmpegPath()).toThrow(`Checked: ${changedPath}, ${bundledPath}.`)
  })
})
