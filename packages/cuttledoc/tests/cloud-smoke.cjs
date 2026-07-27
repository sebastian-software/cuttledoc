'use strict';

const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  recognitionBackends,
  textGenerationBackends,
  transcribeFile,
  version,
} = require('cuttledoc');

const fixture = join(__dirname, 'hosted-preflight.wav');
writeFileSync(fixture, 'not uploaded because the credential gate runs first');

async function main() {
  assert.equal(version(), '0.1.0');
  assert.deepEqual(
    recognitionBackends().map(({ id }) => id),
    ['openai-transcription'],
  );
  assert.deepEqual(
    textGenerationBackends().map(({ id }) => id),
    ['openrouter'],
  );

  assert.throws(
    () =>
      transcribeFile(fixture, {
        language: 'en-US',
        backend: 'openai-transcription',
        timeoutMs: 0,
      }),
    /timeoutMs must be a positive/,
  );

  await assert.rejects(
    transcribeFile(fixture, {
      language: 'en-US',
      backend: 'openai-transcription',
    }),
    /AUTHENTICATION_FAILED/,
  );

  console.log('Cloud-only CommonJS package smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
