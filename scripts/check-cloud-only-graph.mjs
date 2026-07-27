#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const forbidden = [
  'cuttledoc-apple-speech',
  'cuttledoc-whisper',
  'cuttledoc-gemma-mlx',
  'tokenizers',
];

for (const packageName of ['cuttledoc-cli', 'cuttledoc-node']) {
  const result = spawnSync(
    'cargo',
    [
      'tree',
      '--locked',
      '-p',
      packageName,
      '--no-default-features',
      '--edges',
      'normal,build',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  for (const dependency of forbidden) {
    if (result.stdout.includes(dependency)) {
      throw new Error(
        `${packageName}'s cloud-only graph unexpectedly contains ${dependency}`,
      );
    }
  }
}

console.log('Cloud-only dependency graph passed');
