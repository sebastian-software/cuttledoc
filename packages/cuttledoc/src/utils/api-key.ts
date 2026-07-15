export function resolveApiKey(...candidates: (string | null | undefined)[]): string | undefined {
  return candidates.find(
    (candidate): candidate is string => candidate !== null && candidate !== undefined && candidate.length > 0
  )
}
