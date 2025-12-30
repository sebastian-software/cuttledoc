import { describe, expect, it } from "vitest"

import { calculateAverageWER, calculateWER, normalizeText } from "./wer.js"

describe("WER utils", () => {
  describe("normalizeText", () => {
    it("should convert to lowercase", () => {
      expect(normalizeText("Hello World")).toEqual(["hello", "world"])
    })

    it("should remove punctuation", () => {
      expect(normalizeText("Hello, world!")).toEqual(["hello", "world"])
    })

    it("should handle multiple spaces", () => {
      expect(normalizeText("hello    world")).toEqual(["hello", "world"])
    })

    it("should handle empty string", () => {
      expect(normalizeText("")).toEqual([])
    })

    it("should handle unicode letters", () => {
      expect(normalizeText("Müller Größe café")).toEqual(["müller", "größe", "café"])
    })
  })

  describe("calculateWER", () => {
    it("should return 0 for identical texts", () => {
      const result = calculateWER("hello world", "hello world")
      expect(result.wer).toBe(0)
      expect(result.accuracy).toBe(1)
    })

    it("should handle substitutions", () => {
      const result = calculateWER("hello world", "hello earth")
      expect(result.substitutions).toBe(1)
      expect(result.wer).toBe(0.5) // 1 error / 2 words
    })

    it("should handle deletions", () => {
      const result = calculateWER("hello beautiful world", "hello world")
      expect(result.deletions).toBe(1)
      expect(result.wer).toBeCloseTo(1 / 3)
    })

    it("should handle insertions", () => {
      const result = calculateWER("hello world", "hello beautiful world")
      expect(result.insertions).toBe(1)
      expect(result.wer).toBe(0.5) // 1 error / 2 ref words
    })

    it("should handle completely different texts", () => {
      const result = calculateWER("hello world", "foo bar baz")
      expect(result.wer).toBe(1.5) // 3 errors / 2 words
      expect(result.accuracy).toBe(0) // Clamped to 0
    })

    it("should handle empty reference", () => {
      const result = calculateWER("", "hello world")
      expect(result.wer).toBe(1)
      expect(result.insertions).toBe(2)
    })

    it("should handle empty hypothesis", () => {
      const result = calculateWER("hello world", "")
      expect(result.wer).toBe(1)
      expect(result.deletions).toBe(2)
    })

    it("should ignore case and punctuation", () => {
      const result = calculateWER("Hello, World!", "hello world")
      expect(result.wer).toBe(0)
    })

    it("should calculate real-world example correctly", () => {
      const reference = "Im Dorf hinter den Apfelwiesen lebte Leni"
      const hypothesis = "Im Dorf hinter den Apfelwiesen lebte Lenny"

      const result = calculateWER(reference, hypothesis)
      expect(result.substitutions).toBe(1) // Leni -> Lenny
      expect(result.wer).toBeCloseTo(1 / 7) // 1 error / 7 words
      expect(result.accuracy).toBeCloseTo(6 / 7)
    })
  })

  describe("calculateAverageWER", () => {
    it("should handle empty array", () => {
      const result = calculateAverageWER([])
      expect(result.wer).toBe(0)
      expect(result.accuracy).toBe(1)
    })

    it("should calculate average correctly", () => {
      const results = [
        calculateWER("hello world", "hello world"), // 0% WER
        calculateWER("hello world", "hello earth") // 50% WER
      ]

      const avg = calculateAverageWER(results)
      expect(avg.wer).toBe(0.25) // (0 + 1) / 4 total words
      expect(avg.referenceWords).toBe(4)
    })

    it("should accumulate all error types", () => {
      const results = [
        calculateWER("a b c", "a b"), // 1 deletion
        calculateWER("a b", "a b c") // 1 insertion
      ]

      const avg = calculateAverageWER(results)
      expect(avg.deletions).toBe(1)
      expect(avg.insertions).toBe(1)
      expect(avg.referenceWords).toBe(5)
    })
  })
})
