'use strict';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error(
    `cuttledoc currently supports darwin-arm64, received ${process.platform}-${process.arch}`,
  );
}

let native;
try {
  native = require('./cuttledoc.darwin-arm64.node');
} catch (cause) {
  throw new Error(
    'cuttledoc could not load its prebuilt darwin-arm64 artifact; reinstall the package for this platform instead of rebuilding it locally',
    { cause },
  );
}

function version() {
  return native.version();
}

function recognitionBackends() {
  return native.recognitionBackends();
}

function validateOptions(options) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  if (typeof options.language !== 'string' || options.language.trim() === '') {
    throw new TypeError(
      'options.language must be a non-empty BCP 47 language tag or auto',
    );
  }
  if (
    options.backend !== undefined &&
    !['auto', 'apple-speech', 'whisper'].includes(options.backend)
  ) {
    throw new TypeError(
      'options.backend must be auto, apple-speech, or whisper',
    );
  }
  if (
    options.modelPath !== undefined &&
    (typeof options.modelPath !== 'string' || options.modelPath.trim() === '')
  ) {
    throw new TypeError('options.modelPath must be a non-empty model path');
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new TypeError('options.signal must be an AbortSignal');
  }
}

function cancelledPromise() {
  const error = new Error('CANCELLED: transcription was cancelled');
  error.name = 'AbortError';
  error.code = 'CANCELLED';
  return Promise.reject(error);
}

function transcribePcm(pcm, options) {
  if (!(pcm instanceof Uint8Array)) {
    throw new TypeError('pcm must be a Uint8Array containing little-endian f32 samples');
  }
  validateOptions(options);
  if (
    options.sampleRate !== undefined &&
    (!Number.isInteger(options.sampleRate) ||
      options.sampleRate <= 0 ||
      options.sampleRate > 0xffffffff)
  ) {
    throw new TypeError('options.sampleRate must be a positive 32-bit integer');
  }

  if (options.signal?.aborted) {
    return cancelledPromise();
  }

  const ownedPcm = Buffer.from(pcm);
  return native.transcribePcm(
    ownedPcm,
    {
      language: options.language,
      backend: options.backend,
      modelPath: options.modelPath,
      sampleRate: options.sampleRate,
    },
    options.signal,
  );
}

function transcribeFile(path, options) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new TypeError('path must be a non-empty file path');
  }
  validateOptions(options);
  if (
    options.ffmpegPath !== undefined &&
    (typeof options.ffmpegPath !== 'string' ||
      options.ffmpegPath.trim() === '')
  ) {
    throw new TypeError('options.ffmpegPath must be a non-empty executable path');
  }
  if (options.signal?.aborted) {
    return cancelledPromise();
  }

  return native.transcribeFile(
    path,
    {
      language: options.language,
      backend: options.backend,
      modelPath: options.modelPath,
      ffmpegPath: options.ffmpegPath,
    },
    options.signal,
  );
}

module.exports = {
  recognitionBackends,
  transcribeFile,
  transcribePcm,
  version,
};
