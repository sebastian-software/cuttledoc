import { describe, expect, it } from "vitest"

import { countParagraphs, findCorrections, LOCAL_MODELS, stripMarkdown } from "./index.js"

describe("LLM types", () => {
  describe("LOCAL_MODELS", () => {
    it("should have gemma3n:e4b as a model", () => {
      expect(LOCAL_MODELS["gemma3n:e4b"]).toBeDefined()
      expect(LOCAL_MODELS["gemma3n:e4b"].ggufRepo).toContain("gemma")
    })

    it("should have all required fields for each model", () => {
      const entries = Object.entries(LOCAL_MODELS) as [
        string,
        { ggufRepo: string; ggufFile: string; contextSize: number; description: string }
      ][]
      for (const [id, model] of entries) {
        expect(model.ggufRepo, `${id} should have ggufRepo`).toBeDefined()
        expect(model.ggufFile, `${id} should have ggufFile`).toBeDefined()
        expect(model.contextSize, `${id} should have contextSize`).toBeGreaterThan(0)
        expect(model.description, `${id} should have description`).toBeDefined()
      }
    })
  })

  describe("stripMarkdown", () => {
    it("should remove bold formatting", () => {
      expect(stripMarkdown("This is **bold** text")).toBe("This is bold text")
    })

    it("should remove italic formatting", () => {
      expect(stripMarkdown("This is *italic* text")).toBe("This is italic text")
      expect(stripMarkdown("This is _italic_ text")).toBe("This is italic text")
    })

    it("should remove code formatting", () => {
      expect(stripMarkdown("Use `code` here")).toBe("Use code here")
    })

    it("should remove headers", () => {
      expect(stripMarkdown("## Header\nContent")).toBe("Header\nContent")
      expect(stripMarkdown("### Another\nMore")).toBe("Another\nMore")
    })

    it("should remove list markers", () => {
      const result = stripMarkdown("- Item 1\n- Item 2")
      expect(result).toContain("Item 1")
      expect(result).toContain("Item 2")
      expect(result).not.toMatch(/^-/m) // No leading dashes
    })

    it("should collapse multiple newlines", () => {
      expect(stripMarkdown("Para 1\n\n\n\nPara 2")).toBe("Para 1\n\nPara 2")
    })

    it("should handle complex markdown", () => {
      const input = `## TLDR

This is **important** and *emphasized*.

### Section 1

- Point one
- Point two with \`code\``

      const result = stripMarkdown(input)
      expect(result).not.toContain("**")
      expect(result).not.toContain("##")
      expect(result).not.toContain("-")
      expect(result).toContain("important")
      expect(result).toContain("emphasized")
    })
  })

  describe("countParagraphs", () => {
    it("should count single paragraph", () => {
      expect(countParagraphs("Just one paragraph")).toBe(1)
    })

    it("should count multiple paragraphs", () => {
      expect(countParagraphs("Para 1\n\nPara 2\n\nPara 3")).toBe(3)
    })

    it("should ignore empty lines at start/end", () => {
      expect(countParagraphs("\n\nPara 1\n\nPara 2\n\n")).toBe(2)
    })

    it("should treat single newlines as same paragraph", () => {
      expect(countParagraphs("Line 1\nLine 2\nLine 3")).toBe(1)
    })
  })

  describe("findCorrections", () => {
    it("should find no corrections for identical text", () => {
      const corrections = findCorrections("hello world", "hello world")
      expect(corrections).toHaveLength(0)
    })

    it("should find word replacements", () => {
      const corrections = findCorrections("the kansen is here", "the kanister is here")
      expect(corrections.length).toBeGreaterThan(0)
      expect(corrections[0]?.original).toBe("kansen")
      expect(corrections[0]?.corrected).toBe("kanister")
    })

    it("should ignore punctuation differences", () => {
      const corrections = findCorrections("hello world", "hello, world!")
      expect(corrections).toHaveLength(0)
    })

    it("should ignore markdown formatting", () => {
      const corrections = findCorrections("important word here", "**important** word here")
      expect(corrections).toHaveLength(0)
    })

    it("should handle multiple corrections", () => {
      const corrections = findCorrections("the cat set on the mat", "the cat sat on the mat")
      expect(corrections.length).toBeGreaterThanOrEqual(1)
    })
  })
})
