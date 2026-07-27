#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDirectory = resolve(process.argv[2] ?? join(repoRoot, 'artifacts'));
const platform = `${process.platform}-${process.arch}`;
const platformConfiguration = {
  'darwin-arm64': {
    artifactId: 'darwin-arm64-cloud',
    cliSource: 'cuttledoc',
    cliName: 'cuttledoc',
    nativeSource: 'libcuttledoc_node.dylib',
    nativeName: 'cuttledoc.darwin-arm64.node',
    npmOs: 'darwin',
    npmCpu: 'arm64',
  },
  'linux-x64': {
    artifactId: 'linux-x64',
    cliSource: 'cuttledoc',
    cliName: 'cuttledoc',
    nativeSource: 'libcuttledoc_node.so',
    nativeName: 'cuttledoc.linux-x64-gnu.node',
    npmOs: 'linux',
    npmCpu: 'x64',
  },
  'win32-x64': {
    artifactId: 'windows-x64',
    cliSource: 'cuttledoc.exe',
    cliName: 'cuttledoc.exe',
    nativeSource: 'cuttledoc_node.dll',
    nativeName: 'cuttledoc.win32-x64-msvc.node',
    npmOs: 'win32',
    npmCpu: 'x64',
  },
}[platform];

if (platformConfiguration === undefined) {
  throw new Error(
    `cloud-only artifacts require darwin-arm64, linux-x64, or win32-x64, received ${platform}`,
  );
}

function run(command, args, options = {}) {
  const invocation =
    process.platform === 'win32' && command === 'npm'
      ? {
          executable: process.env.ComSpec ?? 'cmd.exe',
          args: ['/d', '/s', '/c', 'npm.cmd', ...args],
        }
      : { executable: command, args };
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    if (result.error !== undefined) {
      throw result.error;
    }
    if (options.capture) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result.stdout?.trim();
}

run(process.execPath, [join(repoRoot, 'scripts/check-cloud-only-graph.mjs')]);
run('cargo', [
  'build',
  '--release',
  '--locked',
  '-p',
  'cuttledoc-cli',
  '-p',
  'cuttledoc-node',
  '--no-default-features',
]);

mkdirSync(outputDirectory, { recursive: true });
const workDirectory = mkdtempSync(join(tmpdir(), 'cuttledoc-cloud-pack-'));
process.on('exit', () => rmSync(workDirectory, { recursive: true, force: true }));

const sourceManifest = JSON.parse(
  readFileSync(join(repoRoot, 'packages/cuttledoc/package.json'), 'utf8'),
);
const version = sourceManifest.version;
const archiveRoot = `cuttledoc-${version}-${platformConfiguration.artifactId}`;
const cliPackageDirectory = join(workDirectory, archiveRoot);
mkdirSync(cliPackageDirectory);
copyFileSync(
  join(repoRoot, 'target/release', platformConfiguration.cliSource),
  join(cliPackageDirectory, platformConfiguration.cliName),
);
if (process.platform !== 'win32') {
  chmodSync(join(cliPackageDirectory, platformConfiguration.cliName), 0o755);
}
copyFileSync(join(repoRoot, 'LICENSE'), join(cliPackageDirectory, 'LICENSE'));
copyFileSync(
  join(repoRoot, 'packages/cuttledoc/README-cloud.md'),
  join(cliPackageDirectory, 'README.md'),
);
const cliArchive = join(outputDirectory, `${archiveRoot}.tar.gz`);
run('tar', ['-C', workDirectory, '-czf', cliArchive, archiveRoot]);

const npmPackageDirectory = join(workDirectory, 'package');
mkdirSync(npmPackageDirectory);
for (const file of ['index.cjs', 'index.js', 'index.d.ts']) {
  copyFileSync(
    join(repoRoot, 'packages/cuttledoc', file),
    join(npmPackageDirectory, file),
  );
}
copyFileSync(
  join(repoRoot, 'packages/cuttledoc/README-cloud.md'),
  join(npmPackageDirectory, 'README.md'),
);
copyFileSync(join(repoRoot, 'LICENSE'), join(npmPackageDirectory, 'LICENSE'));
copyFileSync(
  join(repoRoot, 'target/release', platformConfiguration.nativeSource),
  join(npmPackageDirectory, platformConfiguration.nativeName),
);
const manifest = {
  ...sourceManifest,
  description: 'Explicit hosted speech transcription through Cuttledoc',
  files: [
    platformConfiguration.nativeName,
    'index.cjs',
    'index.js',
    'index.d.ts',
    'README.md',
    'LICENSE',
  ],
  os: [platformConfiguration.npmOs],
  cpu: [platformConfiguration.npmCpu],
};
delete manifest.preferUnplugged;
writeFileSync(
  join(npmPackageDirectory, 'package.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const packedName = run(
  'npm',
  ['pack', '--silent', '--pack-destination', outputDirectory],
  {
    cwd: npmPackageDirectory,
    capture: true,
    env: {
      ...process.env,
      npm_config_cache: join(workDirectory, 'npm-cache'),
    },
  },
);
const nodeArchive = join(outputDirectory, basename(packedName));

console.log(`CLI_ARTIFACT=${cliArchive}`);
console.log(`NODE_ARTIFACT=${nodeArchive}`);
