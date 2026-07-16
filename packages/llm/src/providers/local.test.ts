import { describe, expect, it } from "vitest"

import { getModelsDir } from "./local.js"

describe("local model directory", () => {
  it("uses the XDG cache directory independently of the current working directory", () => {
    const options = {
      env: { XDG_CACHE_HOME: "/var/cache/user" },
      homeDirectory: "/home/user",
      platform: "linux" as const
    }

    expect(getModelsDir(options)).toBe("/var/cache/user/cuttledoc/models/llm")
    expect(getModelsDir(options)).not.toContain(process.cwd())
  })

  it("uses the standard Linux cache when XDG_CACHE_HOME is missing or relative", () => {
    expect(getModelsDir({ env: {}, homeDirectory: "/home/user", platform: "linux" })).toBe(
      "/home/user/.cache/cuttledoc/models/llm"
    )
    expect(
      getModelsDir({ env: { XDG_CACHE_HOME: "relative/cache" }, homeDirectory: "/home/user", platform: "linux" })
    ).toBe("/home/user/.cache/cuttledoc/models/llm")
  })

  it("uses the standard macOS cache directory", () => {
    expect(getModelsDir({ env: {}, homeDirectory: "/Users/user", platform: "darwin" })).toBe(
      "/Users/user/Library/Caches/cuttledoc/models/llm"
    )
  })

  it("uses LOCALAPPDATA on Windows", () => {
    expect(
      getModelsDir({
        env: { LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local" },
        homeDirectory: "C:\\Users\\user",
        platform: "win32"
      })
    ).toBe("C:\\Users\\user\\AppData\\Local\\cuttledoc\\models\\llm")
  })

  it("falls back to the Windows user profile when LOCALAPPDATA is relative", () => {
    expect(
      getModelsDir({
        env: { LOCALAPPDATA: "relative\\cache" },
        homeDirectory: "C:\\Users\\user",
        platform: "win32"
      })
    ).toBe("C:\\Users\\user\\AppData\\Local\\cuttledoc\\models\\llm")
  })

  it("prefers the current override over the deprecated pre-rename override", () => {
    expect(
      getModelsDir({
        env: {
          CUTTLEDOC_LLM_MODELS_DIR: "/models/current",
          LOCAL_TRANSCRIBE_LLM_MODELS_DIR: "/models/legacy"
        },
        homeDirectory: "/home/user",
        platform: "linux"
      })
    ).toBe("/models/current")
  })

  it("keeps the deprecated pre-rename override for compatibility", () => {
    expect(
      getModelsDir({
        env: { LOCAL_TRANSCRIBE_LLM_MODELS_DIR: "/models/legacy" },
        homeDirectory: "/home/user",
        platform: "linux"
      })
    ).toBe("/models/legacy")
  })
})
