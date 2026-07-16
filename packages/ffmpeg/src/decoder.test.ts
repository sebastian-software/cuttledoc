import { describe, expect, it } from "vitest"

import { buildDecodeArgs, calculateDurationSeconds } from "./decoder.js"

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
})
