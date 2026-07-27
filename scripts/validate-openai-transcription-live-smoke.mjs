#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXPECTED_BACKEND = 'openai-transcription';
const EXPECTED_FIXTURE_SHA256 =
  '646f5351df3b2e169ee8ab95d1c740c572c530439b26448fb79d7b5c74665f71';
const SUPPORTED_MODELS = new Set([
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'whisper-1',
]);

function validateNoCredential(contents, credential) {
  if (!credential) {
    throw new Error('OPENAI_API_KEY is required for the live smoke');
  }
  if (contents.some((value) => value.includes(credential))) {
    throw new Error('captured live-smoke output contains the credential');
  }
}

function validateResult(resultText, expectedModel) {
  if (!SUPPORTED_MODELS.has(expectedModel)) {
    throw new Error(`unsupported live-smoke model: ${expectedModel}`);
  }

  let result;
  try {
    result = JSON.parse(resultText);
  } catch {
    throw new Error('live-smoke output is not valid JSON');
  }

  if (result.schema_version !== '1.0.0' || result.kind !== 'transcription') {
    throw new Error('live-smoke output has the wrong schema identity');
  }
  if (result.backend !== EXPECTED_BACKEND || result.model !== expectedModel) {
    throw new Error('live-smoke output has the wrong backend or model');
  }
  if (typeof result.text !== 'string' || result.text.trim().length === 0) {
    throw new Error('live-smoke output contains no transcription text');
  }
}

function safeEvidence(expectedModel, elapsedSeconds) {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 600) {
    throw new Error('live-smoke elapsed time is outside the bounded workflow window');
  }
  return {
    model: expectedModel,
    fixture_sha256: EXPECTED_FIXTURE_SHA256,
    platform: `${process.platform}-${process.arch}`,
    success: true,
    elapsed_seconds: elapsedSeconds,
  };
}

function selfTest() {
  const credential = 'test-openai-secret';
  const validResult = JSON.stringify({
    schema_version: '1.0.0',
    kind: 'transcription',
    backend: EXPECTED_BACKEND,
    model: 'gpt-4o-transcribe',
    text: 'A non-empty transcript.',
  });

  validateNoCredential([validResult, ''], credential);
  validateResult(validResult, 'gpt-4o-transcribe');
  assert.deepEqual(safeEvidence('gpt-4o-transcribe', 12), {
    model: 'gpt-4o-transcribe',
    fixture_sha256: EXPECTED_FIXTURE_SHA256,
    platform: `${process.platform}-${process.arch}`,
    success: true,
    elapsed_seconds: 12,
  });
  assert.throws(
    () => validateNoCredential([`failure: ${credential}`], credential),
    /contains the credential/,
  );
  assert.throws(
    () =>
      validateResult(
        validResult.replace('"A non-empty transcript."', '""'),
        'gpt-4o-transcribe',
      ),
    /no transcription text/,
  );
  assert.throws(
    () => validateResult(validResult, 'whisper-1'),
    /wrong backend or model/,
  );
  process.stdout.write('OpenAI transcription live-smoke validator self-test passed\n');
}

if (process.argv[2] === '--self-test') {
  selfTest();
} else {
  const [resultPath, diagnosticsPath] = process.argv.slice(2);
  const expectedModel = process.env.CUTTLEDOC_LIVE_SMOKE_MODEL;
  const credential = process.env.OPENAI_API_KEY;
  const elapsedSeconds = Number.parseInt(
    process.env.CUTTLEDOC_LIVE_SMOKE_ELAPSED_SECONDS ?? '',
    10,
  );

  if (!resultPath || !diagnosticsPath || !expectedModel) {
    throw new Error(
      'usage: validate-openai-transcription-live-smoke.mjs <result> <diagnostics>',
    );
  }

  const resultText = readFileSync(resultPath, 'utf8');
  const diagnosticsText = readFileSync(diagnosticsPath, 'utf8');
  validateNoCredential([resultText, diagnosticsText], credential);
  validateResult(resultText, expectedModel);
  process.stdout.write(`${JSON.stringify(safeEvidence(expectedModel, elapsedSeconds))}\n`);
}
