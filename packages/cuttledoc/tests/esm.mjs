import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  recognitionBackends,
  transcribePcm,
  version,
} from 'cuttledoc';

assert.equal(version(), '0.1.0');
assert.deepEqual(
  recognitionBackends().map(({ id }) => id),
  ['apple-speech'],
);

assert.throws(
  () => transcribePcm('not pcm', { language: 'en-US' }),
  /pcm must be a Uint8Array/,
);
assert.throws(
  () => transcribePcm(new Uint8Array(4), { language: '' }),
  /language must be a non-empty/,
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
}

console.log('ESM package smoke passed');
