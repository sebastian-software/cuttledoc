#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workDirectory = mkdtempSync(join(tmpdir(), 'cuttledoc-cloud-test-'));
process.on('exit', () => rmSync(workDirectory, { recursive: true, force: true }));
const outputDirectory = join(workDirectory, 'artifacts');

function executable(command) {
  return process.platform === 'win32' && command === 'npm'
    ? 'npm.cmd'
    : command;
}

function run(command, args, options = {}) {
  const result = spawnSync(executable(command), args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
  });
  if (options.expectedFailure) {
    if (result.status === 0) {
      throw new Error(`${command} unexpectedly succeeded`);
    }
    return `${result.stdout}${result.stderr}`;
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const packOutput = run(process.execPath, [
  join(repoRoot, 'scripts/pack-cloud-artifacts.mjs'),
  outputDirectory,
]);
const cliArchive = packOutput.match(/^CLI_ARTIFACT=(.+)$/m)?.[1];
const nodeArchive = packOutput.match(/^NODE_ARTIFACT=(.+)$/m)?.[1];
if (cliArchive === undefined || nodeArchive === undefined) {
  throw new Error(`artifact packer returned an invalid contract:\n${packOutput}`);
}

const forbiddenArchivePattern =
  /(apple-speech|whisper|gemma|mlx|ffmpeg|safetensors|mlmodelc|Cargo\.toml|build\.rs|binding\.gyp)/i;
for (const archive of [cliArchive, nodeArchive]) {
  const entries = run('tar', ['-tzf', archive]);
  if (forbiddenArchivePattern.test(entries)) {
    throw new Error(`${archive} contains a forbidden local/build artifact`);
  }
}

const cliInstallDirectory = join(workDirectory, 'cli');
mkdirSync(cliInstallDirectory);
run('tar', ['-C', cliInstallDirectory, '-xzf', cliArchive]);
const platformId = {
  darwin: 'darwin-arm64-cloud',
  linux: 'linux-x64',
  win32: 'windows-x64',
}[process.platform];
if (platformId === undefined) {
  throw new Error(`unsupported cloud artifact test platform ${process.platform}`);
}
const cliName = process.platform === 'win32' ? 'cuttledoc.exe' : 'cuttledoc';
const cli = join(
  cliInstallDirectory,
  `cuttledoc-0.1.0-${platformId}`,
  cliName,
);
const runtimeEnvironment = { ...process.env };
delete runtimeEnvironment.OPENAI_API_KEY;
const hostedFixture = join(workDirectory, 'hosted-preflight.wav');
writeFileSync(
  hostedFixture,
  'not uploaded because the credential gate runs first',
);
assertEqual(run(cli, ['--version'], { env: runtimeEnvironment }), 'cuttledoc 0.1.0');
const backends = run(cli, ['backends', 'list'], { env: runtimeEnvironment });
if (
  !backends.includes('openai-transcription') ||
  backends.includes('apple-speech') ||
  backends.includes('whisper')
) {
  throw new Error(`cloud-only CLI reported the wrong backends:\n${backends}`);
}
const hostedError = run(
  cli,
  [
    'transcribe',
    hostedFixture,
    '--language',
    'en-US',
    '--backend',
    'openai-transcription',
  ],
  { env: runtimeEnvironment, expectedFailure: true },
);
if (
  !hostedError.includes('AUTHENTICATION_FAILED') ||
  hostedError.toLowerCase().includes('ffmpeg')
) {
  throw new Error(`cloud-only CLI failed the hosted preflight:\n${hostedError}`);
}

const appDirectory = join(workDirectory, 'node-app');
mkdirSync(appDirectory);
const installEnvironment = {
  ...process.env,
  npm_config_ignore_scripts: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_cache: join(workDirectory, 'npm-cache'),
  npm_config_node_gyp: join(workDirectory, 'compiler-must-not-run'),
};
run(
  'npm',
  ['install', '--ignore-scripts', '--no-audit', '--no-fund', nodeArchive],
  { cwd: appDirectory, env: installEnvironment },
);
for (const file of ['cloud-smoke.mjs', 'cloud-smoke.cjs']) {
  copyFileSync(
    join(repoRoot, 'packages/cuttledoc/tests', file),
    join(appDirectory, file),
  );
  run(process.execPath, [join(appDirectory, file)], {
    cwd: appDirectory,
    env: runtimeEnvironment,
  });
}
const installedManifest = JSON.parse(
  readFileSync(
    join(appDirectory, 'node_modules/cuttledoc/package.json'),
    'utf8',
  ),
);
if (
  installedManifest.scripts?.install ||
  installedManifest.scripts?.preinstall ||
  installedManifest.scripts?.postinstall
) {
  throw new Error('cloud-only Node package contains a native build lifecycle');
}

const cliSize = readFileSync(cliArchive).byteLength;
const nodeSize = readFileSync(nodeArchive).byteLength;
console.log(
  `Cloud-only artifact smoke passed (${process.platform}-${process.arch}): CLI ${cliSize} bytes, Node ${nodeSize} bytes`,
);

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
