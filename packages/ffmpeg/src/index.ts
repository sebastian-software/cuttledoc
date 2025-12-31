/**
 * @cuttledoc/ffmpeg - Lightweight FFmpeg wrapper for audio processing
 *
 * Provides a simple API for decoding audio files to Float32 samples,
 * optimized for speech recognition preprocessing.
 */

export { ffmpegPath, isFFmpegAvailable, ffmpegVersion } from "./binary.js"
export { decodeAudio, type DecodeOptions, type AudioData } from "./decoder.js"
