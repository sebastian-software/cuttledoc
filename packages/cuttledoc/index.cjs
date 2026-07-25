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

function transcribePcm(pcm, options) {
  if (!(pcm instanceof Uint8Array)) {
    throw new TypeError('pcm must be a Uint8Array containing little-endian f32 samples');
  }
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  if (typeof options.language !== 'string' || options.language.trim() === '') {
    throw new TypeError('options.language must be a non-empty BCP 47 language tag');
  }
  if (
    options.sampleRate !== undefined &&
    (!Number.isInteger(options.sampleRate) ||
      options.sampleRate <= 0 ||
      options.sampleRate > 0xffffffff)
  ) {
    throw new TypeError('options.sampleRate must be a positive 32-bit integer');
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new TypeError('options.signal must be an AbortSignal');
  }

  if (options.signal?.aborted) {
    const error = new Error('CANCELLED: transcription was cancelled');
    error.name = 'AbortError';
    error.code = 'CANCELLED';
    return Promise.reject(error);
  }

  const ownedPcm = Buffer.from(pcm);
  return native.transcribePcm(
    ownedPcm,
    {
      language: options.language,
      sampleRate: options.sampleRate,
    },
    options.signal,
  );
}

module.exports = { recognitionBackends, transcribePcm, version };
