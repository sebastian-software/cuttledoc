'use strict';

const assert = require('node:assert/strict');
const {
  recognitionBackends,
  transcribePcm,
  version,
} = require('cuttledoc');

async function main() {
  assert.equal(version(), '0.1.0');
  assert.deepEqual(
    recognitionBackends().map(({ id }) => id),
    ['apple-speech'],
  );

  assert.throws(
    () => transcribePcm(Buffer.alloc(4), { language: 'en-US', sampleRate: 0 }),
    /sampleRate must be a positive/,
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

  console.log('CommonJS package smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
