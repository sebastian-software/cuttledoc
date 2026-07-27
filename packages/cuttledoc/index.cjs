'use strict';

const platformId = `${process.platform}-${process.arch}`;
const nativeArtifact = {
  'darwin-arm64': 'cuttledoc.darwin-arm64.node',
  'linux-x64': 'cuttledoc.linux-x64-gnu.node',
  'win32-x64': 'cuttledoc.win32-x64-msvc.node',
}[platformId];

if (nativeArtifact === undefined) {
  throw new Error(
    `cuttledoc does not provide a prebuilt artifact for ${platformId}`,
  );
}

let native;
try {
  native = require(`./${nativeArtifact}`);
} catch (cause) {
  throw new Error(
    `cuttledoc could not load its prebuilt ${platformId} artifact; reinstall the package for this platform instead of rebuilding it locally`,
    { cause },
  );
}

function version() {
  return native.version();
}

function recognitionBackends() {
  return native.recognitionBackends();
}

function textGenerationBackends() {
  return native.textGenerationBackends();
}

function validateOptions(options, allowHosted) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  if (typeof options.language !== 'string' || options.language.trim() === '') {
    throw new TypeError(
      'options.language must be a non-empty BCP 47 language tag or auto',
    );
  }
  const backends = allowHosted
    ? ['auto', 'apple-speech', 'whisper', 'openai-transcription']
    : ['auto', 'apple-speech', 'whisper'];
  if (
    options.backend !== undefined &&
    !backends.includes(options.backend)
  ) {
    throw new TypeError(
      `options.backend must be ${backends.join(', ')}`,
    );
  }
  if (
    options.model !== undefined &&
    (typeof options.model !== 'string' || options.model.trim() === '')
  ) {
    throw new TypeError('options.model must be a non-empty model identifier');
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
  if (
    options.enhancement !== undefined &&
    !['off', 'local', 'gemini'].includes(options.enhancement)
  ) {
    throw new TypeError(
      'options.enhancement must be off, local, or gemini',
    );
  }
  if (
    options.enhancementModelPath !== undefined &&
    (typeof options.enhancementModelPath !== 'string' ||
      options.enhancementModelPath.trim() === '')
  ) {
    throw new TypeError(
      'options.enhancementModelPath must be a non-empty model directory',
    );
  }
  if (
    options.enhancementModelPath !== undefined &&
    options.enhancement !== 'local'
  ) {
    throw new TypeError(
      'options.enhancementModelPath requires enhancement: local',
    );
  }
  if (
    options.credential !== undefined &&
    (typeof options.credential !== 'string' ||
      options.credential.trim() === '')
  ) {
    throw new TypeError(
      'options.credential must be a non-empty hosted credential',
    );
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) ||
      options.timeoutMs <= 0 ||
      options.timeoutMs > 0xffffffff)
  ) {
    throw new TypeError('options.timeoutMs must be a positive 32-bit integer');
  }
  if (
    (options.credential !== undefined || options.timeoutMs !== undefined) &&
    (!allowHosted || options.backend !== 'openai-transcription')
  ) {
    throw new TypeError(
      'options.credential and options.timeoutMs require backend: openai-transcription',
    );
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
  validateOptions(options, false);
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
      model: options.model,
      modelPath: options.modelPath,
      sampleRate: options.sampleRate,
      enhancement: options.enhancement,
      enhancementModelPath: options.enhancementModelPath,
    },
    options.signal,
  );
}

function transcribeFile(path, options) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new TypeError('path must be a non-empty file path');
  }
  validateOptions(options, true);
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
      model: options.model,
      modelPath: options.modelPath,
      credential: options.credential,
      timeoutMs: options.timeoutMs,
      ffmpegPath: options.ffmpegPath,
      enhancement: options.enhancement,
      enhancementModelPath: options.enhancementModelPath,
    },
    options.signal,
  );
}

module.exports = {
  recognitionBackends,
  textGenerationBackends,
  transcribeFile,
  transcribePcm,
  version,
};
