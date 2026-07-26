import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  recognitionBackends,
  transcribeFile,
  transcribePcm,
  version,
} from 'cuttledoc';

assert.equal(version(), '0.1.0');
assert.deepEqual(
  recognitionBackends().map(({ id }) => id),
  ['apple-speech', 'whisper'],
);

assert.throws(
  () => transcribePcm('not pcm', { language: 'en-US' }),
  /pcm must be a Uint8Array/,
);
assert.throws(
  () => transcribePcm(new Uint8Array(4), { language: '' }),
  /language must be a non-empty/,
);
assert.throws(
  () => transcribeFile('', { language: 'en-US' }),
  /path must be a non-empty/,
);
assert.throws(
  () =>
    transcribePcm(new Uint8Array(4), {
      language: 'en-US',
      backend: 'unknown',
    }),
  /backend must be/,
);
assert.throws(
  () =>
    transcribePcm(new Uint8Array(4), {
      language: 'en-US',
      modelPath: '',
    }),
  /modelPath must be a non-empty/,
);
assert.throws(
  () =>
    transcribeFile('/tmp/input.ogg', {
      language: 'en-US',
      ffmpegPath: '',
    }),
  /ffmpegPath must be a non-empty/,
);

const controller = new AbortController();
controller.abort();
await assert.rejects(
  transcribePcm(new Uint8Array(4), {
    language: 'en-US',
    signal: controller.signal,
  }),
  (error) => error.name === 'AbortError' && error.code === 'CANCELLED',
);

await assert.rejects(
  transcribePcm(new Uint8Array(3), { language: 'en-US' }),
  /INVALID_INPUT/,
);

const fileController = new AbortController();
fileController.abort();
await assert.rejects(
  transcribeFile('/tmp/input.ogg', {
    language: 'en-US',
    signal: fileController.signal,
  }),
  (error) => error.name === 'AbortError' && error.code === 'CANCELLED',
);

await assert.rejects(
  transcribeFile('/definitely/missing/cuttledoc.media', {
    language: 'en-US',
  }),
  /INVALID_INPUT/,
);

if (process.env.CUTTLEDOC_NODE_PCM_FIXTURE) {
  const pcm = await readFile(process.env.CUTTLEDOC_NODE_PCM_FIXTURE);
  const result = await transcribePcm(pcm, { language: 'en-US' });
  assert.equal(
    result.text,
    'However, due to the slow communication channels, styles in the West could lag behind by 25 to 30 years.',
  );
  assert.equal(result.language, 'en_US');
  assert.equal(result.backend, 'apple-speech');
  assert.equal(result.mediaDurationMs, 10_560);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].words.length, 19);

  const activeController = new AbortController();
  const cancelled = transcribePcm(pcm, {
    language: 'en-US',
    signal: activeController.signal,
  });
  setTimeout(() => activeController.abort(), 5);
  await assert.rejects(cancelled, /CANCELLED/);

  if (process.env.CUTTLEDOC_NODE_WHISPER_MODEL_PATH) {
    const whisper = await transcribePcm(pcm, {
      language: 'en',
      backend: 'whisper',
      modelPath: process.env.CUTTLEDOC_NODE_WHISPER_MODEL_PATH,
    });
    assert.equal(
      whisper.text,
      'However, due to the slow communication channels, styles in the West could lag behind by 25-30 years.',
    );
    assert.equal(whisper.language, 'en');
    assert.equal(whisper.backend, 'whisper');
    assert.equal(whisper.model, 'whisper-large-v3-turbo');
    assert.equal(whisper.mediaDurationMs, 10_560);
    assert.equal(whisper.segments.length, 1);
    assert.equal(whisper.segments[0].words.length, 0);

    const whisperController = new AbortController();
    const cancelledWhisper = transcribePcm(pcm, {
      language: 'en',
      backend: 'whisper',
      modelPath: process.env.CUTTLEDOC_NODE_WHISPER_MODEL_PATH,
      signal: whisperController.signal,
    });
    setTimeout(() => whisperController.abort(), 5);
    await assert.rejects(cancelledWhisper, /CANCELLED|aborted/i);
  }
}

if (process.env.CUTTLEDOC_NODE_MEDIA_FIXTURE) {
  const options = {
    language: 'en-US',
    ffmpegPath: process.env.CUTTLEDOC_NODE_FFMPEG_PATH,
  };
  const result = await transcribeFile(
    process.env.CUTTLEDOC_NODE_MEDIA_FIXTURE,
    options,
  );
  assert.equal(
    result.text,
    'However, due to the slow communication channels, styles in the West could lag behind by 25 to 30 years.',
  );
  assert.equal(result.language, 'en_US');
  assert.equal(result.backend, 'apple-speech');
  assert.equal(result.mediaDurationMs, 10_560);
  assert.equal(result.segments[0].words.length, 19);

  const activeFileController = new AbortController();
  const cancelledFile = transcribeFile(
    process.env.CUTTLEDOC_NODE_MEDIA_FIXTURE,
    {
      ...options,
      signal: activeFileController.signal,
    },
  );
  setTimeout(() => activeFileController.abort(), 5);
  await assert.rejects(cancelledFile, /CANCELLED/);
}

console.log('ESM package smoke passed');
