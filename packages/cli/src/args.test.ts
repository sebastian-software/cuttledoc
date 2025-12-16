import { describe, expect, it } from "vitest";

import { parseArgs } from "./args.js";

describe("CLI args parser", () => {
  describe("flags", () => {
    it("should parse --help", () => {
      expect(parseArgs(["--help"]).help).toBe(true);
      expect(parseArgs(["-h"]).help).toBe(true);
    });

    it("should parse --version", () => {
      expect(parseArgs(["--version"]).version).toBe(true);
      expect(parseArgs(["-v"]).version).toBe(true);
    });

    it("should parse --quiet", () => {
      expect(parseArgs(["--quiet"]).quiet).toBe(true);
      expect(parseArgs(["-q"]).quiet).toBe(true);
    });

    it("should parse --stats", () => {
      expect(parseArgs(["--stats"]).stats).toBe(true);
      expect(parseArgs(["-s"]).stats).toBe(true);
    });

    it("should parse --enhance", () => {
      expect(parseArgs(["--enhance"]).enhance).toBe(true);
      expect(parseArgs(["-e"]).enhance).toBe(true);
    });

    it("should parse --correct-only", () => {
      const args = parseArgs(["--correct-only"]);
      expect(args.correctOnly).toBe(true);
      expect(args.enhance).toBe(true); // Should also enable enhance
    });
  });

  describe("options with values", () => {
    it("should parse --backend", () => {
      expect(parseArgs(["--backend", "apple"]).backend).toBe("apple");
      expect(parseArgs(["-b", "whisper"]).backend).toBe("whisper");
    });

    it("should parse --model", () => {
      expect(parseArgs(["--model", "whisper-large"]).model).toBe("whisper-large");
      expect(parseArgs(["-m", "parakeet-v3"]).model).toBe("parakeet-v3");
    });

    it("should parse --language", () => {
      expect(parseArgs(["--language", "de"]).language).toBe("de");
      expect(parseArgs(["-l", "en-US"]).language).toBe("en-US");
    });

    it("should parse --output", () => {
      expect(parseArgs(["--output", "out.md"]).output).toBe("out.md");
      expect(parseArgs(["-o", "transcript.txt"]).output).toBe("transcript.txt");
    });

    it("should parse --llm-model", () => {
      expect(parseArgs(["--llm-model", "gemma3:4b"]).llmModel).toBe("gemma3:4b");
    });
  });

  describe("positional arguments", () => {
    it("should parse file path", () => {
      const args = parseArgs(["audio.mp3"]);
      expect(args.positional).toEqual(["audio.mp3"]);
    });

    it("should parse multiple positional args", () => {
      const args = parseArgs(["file1.mp3", "file2.wav"]);
      expect(args.positional).toEqual(["file1.mp3", "file2.wav"]);
    });

    it("should separate positional from options", () => {
      const args = parseArgs(["audio.mp3", "-l", "de", "-e"]);
      expect(args.positional).toEqual(["audio.mp3"]);
      expect(args.language).toBe("de");
      expect(args.enhance).toBe(true);
    });
  });

  describe("subcommands", () => {
    it("should parse models subcommand", () => {
      const args = parseArgs(["models", "list"]);
      expect(args.command).toBe("models");
      expect(args.positional).toEqual(["list"]);
    });

    it("should parse models download subcommand", () => {
      const args = parseArgs(["models", "download", "whisper-small"]);
      expect(args.command).toBe("models");
      expect(args.positional).toEqual(["download", "whisper-small"]);
    });
  });

  describe("combined usage", () => {
    it("should parse typical transcribe command", () => {
      const args = parseArgs([
        "podcast.mp3",
        "-b", "apple",
        "-l", "de",
        "-o", "output.md",
        "-e",
        "-s",
      ]);

      expect(args.positional).toEqual(["podcast.mp3"]);
      expect(args.backend).toBe("apple");
      expect(args.language).toBe("de");
      expect(args.output).toBe("output.md");
      expect(args.enhance).toBe(true);
      expect(args.stats).toBe(true);
    });

    it("should handle defaults", () => {
      const args = parseArgs(["file.mp3"]);
      expect(args.help).toBe(false);
      expect(args.version).toBe(false);
      expect(args.quiet).toBe(false);
      expect(args.enhance).toBe(false);
      expect(args.backend).toBeUndefined();
      expect(args.language).toBeUndefined();
    });
  });
});

