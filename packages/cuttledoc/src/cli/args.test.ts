import { describe, expect, it, vi } from "vitest"

import { parseArgs } from "./args.js"

// Suppress console.warn during tests
vi.spyOn(console, "warn").mockImplementation(() => undefined)

describe("parseArgs", () => {
  describe("flags", () => {
    it("should parse -h flag", () => {
      const args = parseArgs(["-h"])
      expect(args.help).toBe(true)
    })

    it("should parse --help flag", () => {
      const args = parseArgs(["--help"])
      expect(args.help).toBe(true)
    })

    it("should parse -v flag", () => {
      const args = parseArgs(["-v"])
      expect(args.version).toBe(true)
    })

    it("should parse --version flag", () => {
      const args = parseArgs(["--version"])
      expect(args.version).toBe(true)
    })

    it("should parse -q flag", () => {
      const args = parseArgs(["-q"])
      expect(args.quiet).toBe(true)
    })

    it("should parse --quiet flag", () => {
      const args = parseArgs(["--quiet"])
      expect(args.quiet).toBe(true)
    })

    it("should parse -s flag", () => {
      const args = parseArgs(["-s"])
      expect(args.stats).toBe(true)
    })

    it("should parse --stats flag", () => {
      const args = parseArgs(["--stats"])
      expect(args.stats).toBe(true)
    })

    it("should parse -e flag (full enhancement)", () => {
      const args = parseArgs(["-e"])
      expect(args.enhance).toBe(true)
      expect(args.correctOnly).toBe(false) // Full enhancement disables correct-only
    })

    it("should parse --enhance flag (full enhancement)", () => {
      const args = parseArgs(["--enhance"])
      expect(args.enhance).toBe(true)
      expect(args.correctOnly).toBe(false) // Full enhancement disables correct-only
    })

    it("should parse --no-enhance flag", () => {
      const args = parseArgs(["--no-enhance"])
      expect(args.enhance).toBe(false)
    })

    it("should parse --correct-only flag", () => {
      const args = parseArgs(["--correct-only"])
      expect(args.correctOnly).toBe(true)
      expect(args.enhance).toBe(true)
    })
  })

  describe("options with values", () => {
    it("should parse -b option", () => {
      const args = parseArgs(["-b", "parakeet"])
      expect(args.backend).toBe("parakeet")
    })

    it("should parse --backend option", () => {
      const args = parseArgs(["--backend", "sherpa"])
      expect(args.backend).toBe("sherpa")
    })

    it("should parse -m option", () => {
      const args = parseArgs(["-m", "whisper-medium"])
      expect(args.model).toBe("whisper-medium")
    })

    it("should parse --model option", () => {
      const args = parseArgs(["--model", "parakeet-tdt-0.6b-v3"])
      expect(args.model).toBe("parakeet-tdt-0.6b-v3")
    })

    it("should parse -l option", () => {
      const args = parseArgs(["-l", "de"])
      expect(args.language).toBe("de")
    })

    it("should parse --language option", () => {
      const args = parseArgs(["--language", "en-US"])
      expect(args.language).toBe("en-US")
    })

    it("should parse -o option", () => {
      const args = parseArgs(["-o", "output.txt"])
      expect(args.output).toBe("output.txt")
    })

    it("should parse --output option", () => {
      const args = parseArgs(["--output", "transcript.md"])
      expect(args.output).toBe("transcript.md")
    })

    it("should parse --llm-model option", () => {
      const args = parseArgs(["--llm-model", "gemma3n:e4b"])
      expect(args.llmModel).toBe("gemma3n:e4b")
    })
  })

  describe("subcommands", () => {
    it("should parse models command", () => {
      const args = parseArgs(["models"])
      expect(args.command).toBe("models")
    })

    it("should parse models command with subcommand", () => {
      const args = parseArgs(["models", "list"])
      expect(args.command).toBe("models")
      expect(args.positional).toEqual(["list"])
    })

    it("should parse models download command", () => {
      const args = parseArgs(["models", "download", "parakeet-tdt-0.6b-v3"])
      expect(args.command).toBe("models")
      expect(args.positional).toEqual(["download", "parakeet-tdt-0.6b-v3"])
    })
  })

  describe("positional arguments", () => {
    it("should parse single positional argument", () => {
      const args = parseArgs(["audio.mp3"])
      expect(args.positional).toEqual(["audio.mp3"])
    })

    it("should parse multiple positional arguments", () => {
      const args = parseArgs(["audio1.mp3", "audio2.wav"])
      expect(args.positional).toEqual(["audio1.mp3", "audio2.wav"])
    })

    it("should parse positional with options", () => {
      const args = parseArgs(["audio.mp3", "-l", "de", "-o", "out.txt"])
      expect(args.positional).toEqual(["audio.mp3"])
      expect(args.language).toBe("de")
      expect(args.output).toBe("out.txt")
    })
  })

  describe("complex argument combinations", () => {
    it("should parse full command line", () => {
      const args = parseArgs([
        "meeting.m4a",
        "-b",
        "parakeet",
        "-l",
        "de",
        "-o",
        "transcript.md",
        "-e",
        "--llm-model",
        "gemma3n:e4b",
        "-s"
      ])

      expect(args.positional).toEqual(["meeting.m4a"])
      expect(args.backend).toBe("parakeet")
      expect(args.language).toBe("de")
      expect(args.output).toBe("transcript.md")
      expect(args.enhance).toBe(true)
      expect(args.llmModel).toBe("gemma3n:e4b")
      expect(args.stats).toBe(true)
    })

    it("should handle empty argv", () => {
      const args = parseArgs([])
      expect(args.help).toBe(false)
      expect(args.positional).toEqual([])
    })

    it("should warn on unknown option", () => {
      parseArgs(["--unknown-flag"])

      expect(console.warn).toHaveBeenCalledWith("Unknown option: --unknown-flag")
    })
  })

  describe("default values", () => {
    it("should have correct defaults (LLM correction enabled by default)", () => {
      const args = parseArgs([])

      expect(args.help).toBe(false)
      expect(args.version).toBe(false)
      expect(args.quiet).toBe(false)
      expect(args.stats).toBe(false)
      expect(args.enhance).toBe(true) // LLM correction enabled by default
      expect(args.correctOnly).toBe(true) // Only correction, no formatting by default
      expect(args.backend).toBeUndefined()
      expect(args.model).toBeUndefined()
      expect(args.language).toBeUndefined()
      expect(args.output).toBeUndefined()
      expect(args.llmModel).toBeUndefined()
      expect(args.command).toBeUndefined()
      expect(args.positional).toEqual([])
    })
  })
})
