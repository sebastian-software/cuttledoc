import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  recognitionBackends,
  textGenerationBackends,
  transcribeFile,
  version,
} from 'cuttledoc';

const fixture = fileURLToPath(new URL('./hosted-preflight.wav', import.meta.url));
writeFileSync(fixture, 'not uploaded because the credential gate runs first');

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
      credential: 'unused',
    }),
  /require backend: openai-transcription/,
);

const controller = new AbortController();
controller.abort();
await assert.rejects(
  transcribeFile(fixture, {
    language: 'en-US',
    backend: 'openai-transcription',
    credential: 'unused',
    signal: controller.signal,
  }),
  (error) => error.name === 'AbortError' && error.code === 'CANCELLED',
);

await assert.rejects(
  transcribeFile(fixture, {
    language: 'en-US',
    backend: 'openai-transcription',
  }),
  /AUTHENTICATION_FAILED/,
);

console.log('Cloud-only ESM package smoke passed');
