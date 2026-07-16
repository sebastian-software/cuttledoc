import { describe, expect, it, vi } from "vitest"

import { buildDecodeArgs, calculateDurationSeconds, cleanupTemporaryDirectory, toFloat32Samples } from "./decoder.js"

describe("audio decoding", () => {
  it("builds streaming f32le output arguments with speech optimization", () => {
    expect(buildDecodeArgs("/input/audio.mp3", 16_000, 2, true)).toEqual([
      "-hide_banner",
      "-nostdin",
      "-i",
      "/input/audio.mp3",
      "-af",
      "highpass=f=80,lowpass=f=12000,loudnorm=I=-16:LRA=11:TP=-1.5",
      "-ar",
      "16000",
      "-ac",
      "2",
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "-"
    ])
  })

  it("omits speech filters when optimization is disabled", () => {
    const args = buildDecodeArgs("audio.wav", 48_000, 1, false)

    expect(args).not.toContain("-af")
    expect(args).toEqual([
      "-hide_banner",
      "-nostdin",
      "-i",
      "audio.wav",
      "-ar",
      "48000",
      "-ac",
      "1",
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "-"
    ])
  })

  it("calculates duration from interleaved multi-channel samples", () => {
    expect(calculateDurationSeconds(64_000, 16_000, 2)).toBe(2)
    expect(calculateDurationSeconds(48_000, 48_000, 1)).toBe(1)
  })

  it("does not expose unrelated bytes from a pooled Buffer", () => {
    const pool = Buffer.allocUnsafe(32)
    const pcm = pool.subarray(4, 12)
    pcm.writeFloatLE(0.25, 0)
    pcm.writeFloatLE(-0.5, 4)

    const samples = toFloat32Samples(pcm)

    expect([...samples]).toEqual([0.25, -0.5])
    expect(samples.buffer.byteLength).toBe(pcm.byteLength)
    expect(samples.buffer).not.toBe(pcm.buffer)
  })

  it("reuses an exact dedicated Buffer without copying", () => {
    const pcm = Buffer.allocUnsafeSlow(8)
    pcm.writeFloatLE(0.5, 0)
    pcm.writeFloatLE(-0.25, 4)

    const samples = toFloat32Samples(pcm)

    expect([...samples]).toEqual([0.5, -0.25])
    expect(samples.buffer).toBe(pcm.buffer)
  })

  it("does not replace the decode outcome when temporary cleanup fails", async () => {
    const removeDirectory = vi.fn().mockRejectedValue(new Error("temporary directory is busy"))

    await expect(cleanupTemporaryDirectory("/tmp/decoded", removeDirectory)).resolves.toBeUndefined()
    expect(removeDirectory).toHaveBeenCalledWith("/tmp/decoded", { recursive: true, force: true })
  })
})
