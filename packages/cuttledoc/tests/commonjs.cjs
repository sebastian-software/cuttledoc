'use strict';

const assert = require('node:assert/strict');
const {
  recognitionBackends,
  textGenerationBackends,
  transcribeFile,
  transcribePcm,
  version,
} = require('cuttledoc');

async function main() {
  assert.equal(version(), '0.1.0');
  assert.deepEqual(
    recognitionBackends().map(({ id }) => id),
    ['apple-speech', 'whisper', 'openai-transcription'],
  );
  assert.deepEqual(
    textGenerationBackends().map(({ id }) => id),
    ['gemma-mlx', 'openrouter'],
  );

  assert.throws(
    () => transcribePcm(Buffer.alloc(4), { language: 'en-US', sampleRate: 0 }),
    /sampleRate must be a positive/,
  );
  assert.throws(
    () => transcribeFile('/tmp/input.ogg', { language: '' }),
    /language must be a non-empty/,
  );
  assert.throws(
    () =>
      transcribeFile('/tmp/input.ogg', {
        language: 'en-US',
        enhancement: 'automatic',
      }),
    /enhancement must be/,
  );
  assert.throws(
    () =>
      transcribeFile('/tmp/input.ogg', {
        language: 'en-US',
        backend: 'openai-transcription',
        credential: '',
      }),
    /credential must be a non-empty/,
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    transcribePcm(Buffer.alloc(4), {
      language: 'en-US',
      signal: controller.signal,
    }),
    (error) => error.name === 'AbortError' && error.code === 'CANCELLED',
  );

  await assert.rejects(
    transcribePcm(Buffer.alloc(3), { language: 'en-US' }),
    /INVALID_INPUT/,
  );
  await assert.rejects(
    transcribeFile('/definitely/missing/cuttledoc.media', {
      language: 'en-US',
    }),
    /INVALID_INPUT/,
  );

  if (process.env.CUTTLEDOC_NODE_MEDIA_FIXTURE) {
    const result = await transcribeFile(
      process.env.CUTTLEDOC_NODE_MEDIA_FIXTURE,
      {
        language: 'en-US',
        ffmpegPath: process.env.CUTTLEDOC_NODE_FFMPEG_PATH,
      },
    );
    assert.equal(
      result.text,
      'However, due to the slow communication channels, styles in the West could lag behind by 25 to 30 years.',
    );
    assert.equal(result.rawText, result.text);
    assert.equal(result.language, 'en_US');
    assert.equal(result.backend, 'apple-speech');
    assert.equal(result.mediaDurationMs, 10_560);
    assert.equal(result.segments[0].words.length, 19);
  }

  if (
    process.env.CUTTLEDOC_NODE_PCM_FIXTURE &&
    process.env.CUTTLEDOC_NODE_WHISPER_MODEL_PATH
  ) {
    const pcm = require('node:fs').readFileSync(
      process.env.CUTTLEDOC_NODE_PCM_FIXTURE,
    );
    const whisper = await transcribePcm(pcm, {
      language: 'auto',
      backend: 'whisper',
      modelPath: process.env.CUTTLEDOC_NODE_WHISPER_MODEL_PATH,
    });
    assert.equal(
      whisper.text,
      'However, due to the slow communication channels, styles in the West could lag behind by 25-30 years.',
    );
    assert.equal(whisper.rawText, whisper.text);
    assert.equal(whisper.language, 'en');
    assert.equal(whisper.backend, 'whisper');
    assert.equal(whisper.model, 'whisper-large-v3-turbo');
    assert.equal(whisper.segments.length, 1);
  }

  console.log('CommonJS package smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
