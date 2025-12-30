/**
 * Word Error Rate (WER) calculation utilities
 *
 * WER = (S + D + I) / N
 * where:
 *   S = substitutions
 *   D = deletions
 *   I = insertions
 *   N = total words in reference
 */

/**
 * Normalize text for WER comparison
 */
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove punctuation, keep letters/numbers
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

/**
 * Calculate Levenshtein distance between two arrays (for WER)
 */
function levenshteinDistance(
  ref: string[],
  hyp: string[]
): { distance: number; substitutions: number; deletions: number; insertions: number } {
  const m = ref.length
  const n = hyp.length

  // Create DP matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0))

  // Initialize
  for (let i = 0; i <= m; i++) {
    const row = dp[i]
    if (row !== undefined) {
      row[0] = i
    }
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0]
    if (row !== undefined) {
      row[j] = j
    }
  }

  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const prevRow = dp[i - 1]
      const currRow = dp[i]
      if (prevRow === undefined || currRow === undefined) {
        continue
      }

      if (ref[i - 1] === hyp[j - 1]) {
        currRow[j] = prevRow[j - 1] ?? 0
      } else {
        const deletion = prevRow[j] ?? 0
        const insertion = currRow[j - 1] ?? 0
        const substitution = prevRow[j - 1] ?? 0
        currRow[j] = 1 + Math.min(deletion, insertion, substitution)
      }
    }
  }

  // Backtrack to count operation types
  let i = m
  let j = n
  let substitutions = 0
  let deletions = 0
  let insertions = 0

  while (i > 0 || j > 0) {
    const currRow = dp[i]
    const prevRow = dp[i - 1]
    const currVal = currRow?.[j] ?? 0
    const diagVal = prevRow?.[j - 1] ?? 0
    const upVal = prevRow?.[j] ?? 0

    if (i > 0 && j > 0 && ref[i - 1] === hyp[j - 1]) {
      i--
      j--
    } else if (i > 0 && j > 0 && currVal === diagVal + 1) {
      substitutions++
      i--
      j--
    } else if (i > 0 && currVal === upVal + 1) {
      deletions++
      i--
    } else {
      insertions++
      j--
    }
  }

  const lastRow = dp[m]
  const distance = lastRow?.[n] ?? 0

  return {
    distance,
    substitutions,
    deletions,
    insertions
  }
}

/**
 * WER result with details
 */
export interface WERResult {
  /** Word Error Rate (0-1, can be >1 if many insertions) */
  wer: number
  /** Word Accuracy Rate (1 - WER, clamped to 0-1) */
  accuracy: number
  /** Number of substituted words */
  substitutions: number
  /** Number of deleted words */
  deletions: number
  /** Number of inserted words */
  insertions: number
  /** Total words in reference */
  referenceWords: number
  /** Total words in hypothesis */
  hypothesisWords: number
}

/**
 * Calculate Word Error Rate between reference and hypothesis text
 *
 * @param reference - Ground truth text
 * @param hypothesis - Transcribed/recognized text
 * @returns WER result with detailed metrics
 */
export function calculateWER(reference: string, hypothesis: string): WERResult {
  const refWords = normalizeText(reference)
  const hypWords = normalizeText(hypothesis)

  if (refWords.length === 0) {
    return {
      wer: hypWords.length > 0 ? 1 : 0,
      accuracy: hypWords.length > 0 ? 0 : 1,
      substitutions: 0,
      deletions: 0,
      insertions: hypWords.length,
      referenceWords: 0,
      hypothesisWords: hypWords.length
    }
  }

  const { distance, substitutions, deletions, insertions } = levenshteinDistance(refWords, hypWords)
  const wer = distance / refWords.length

  return {
    wer,
    accuracy: Math.max(0, Math.min(1, 1 - wer)),
    substitutions,
    deletions,
    insertions,
    referenceWords: refWords.length,
    hypothesisWords: hypWords.length
  }
}

/**
 * Calculate average WER across multiple samples
 */
export function calculateAverageWER(results: WERResult[]): WERResult {
  if (results.length === 0) {
    return {
      wer: 0,
      accuracy: 1,
      substitutions: 0,
      deletions: 0,
      insertions: 0,
      referenceWords: 0,
      hypothesisWords: 0
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      substitutions: acc.substitutions + r.substitutions,
      deletions: acc.deletions + r.deletions,
      insertions: acc.insertions + r.insertions,
      referenceWords: acc.referenceWords + r.referenceWords,
      hypothesisWords: acc.hypothesisWords + r.hypothesisWords
    }),
    { substitutions: 0, deletions: 0, insertions: 0, referenceWords: 0, hypothesisWords: 0 }
  )

  const totalErrors = totals.substitutions + totals.deletions + totals.insertions
  const wer = totals.referenceWords > 0 ? totalErrors / totals.referenceWords : 0

  return {
    wer,
    accuracy: Math.max(0, Math.min(1, 1 - wer)),
    ...totals
  }
}
