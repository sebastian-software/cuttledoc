/**
 * Type declarations for sherpa-onnx-node
 *
 * The package doesn't ship its own types, so we declare the module
 * to satisfy TypeScript. The actual types are defined in ./sherpa/types.ts
 */
declare module "sherpa-onnx-node" {
  export const OfflineRecognizer: unknown
  export function readWave(filename: string): { samples: Float32Array; sampleRate: number }
  export function writeWave(filename: string, data: { samples: Float32Array; sampleRate: number }): void
  export const version: string
  export const gitSha1: string
  export const gitDate: string
}
