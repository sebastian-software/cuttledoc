#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { finished } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGzip, gunzipSync } from 'node:zlib';

const blockSize = 512;
const maximumTarNumber = 0o77777777777;

export async function createDeterministicTarGz(
  sourceDirectory,
  outputPath,
  options = {},
) {
  const source = resolve(sourceDirectory);
  const output = resolve(outputPath);
  const sourceStat = lstatSync(source);
  if (!sourceStat.isDirectory()) {
    throw new Error(`archive source must be a directory: ${source}`);
  }
  const rootName = basename(source);
  validateArchivePath(rootName);

  const mtime = resolveMtime(options.mtime);
  const entries = collectEntries(source, rootName);
  mkdirSync(dirname(output), { recursive: true });

  const outputStream = createWriteStream(output, { mode: 0o644 });
  const gzip = createGzip({ level: 9, mtime: 0 });
  gzip.pipe(outputStream);
  const gzipCompletion = finished(gzip);
  const outputCompletion = finished(outputStream);

  try {
    for (const entry of entries) {
      await writeChunk(
        gzip,
        createHeader({
          path: entry.archivePath,
          type: entry.type,
          size: entry.size,
          mode: entry.mode,
          mtime,
        }),
      );
      if (entry.type === 'file') {
        for await (const chunk of createReadStream(entry.sourcePath)) {
          await writeChunk(gzip, chunk);
        }
        const padding = (blockSize - (entry.size % blockSize)) % blockSize;
        if (padding > 0) {
          await writeChunk(gzip, Buffer.alloc(padding));
        }
      }
    }
    await writeChunk(gzip, Buffer.alloc(blockSize * 2));
    gzip.end();
    await Promise.all([gzipCompletion, outputCompletion]);
  } catch (error) {
    gzip.destroy();
    outputStream.destroy();
    await Promise.allSettled([gzipCompletion, outputCompletion]);
    rmSync(output, { force: true });
    throw error;
  }

  return output;
}

function collectEntries(sourceDirectory, rootName) {
  const entries = [
    {
      archivePath: `${rootName}/`,
      sourcePath: sourceDirectory,
      type: 'directory',
      size: 0,
      mode: 0o755,
    },
  ];

  function visit(directory, relativeDirectory) {
    const names = readdirSync(directory).sort(compareUtf8);
    for (const name of names) {
      const sourcePath = join(directory, name);
      const stat = lstatSync(sourcePath);
      const relativePath =
        relativeDirectory.length === 0
          ? name
          : `${relativeDirectory}/${name}`;
      const archivePath = `${rootName}/${relativePath}`;
      validateArchivePath(archivePath);

      if (stat.isDirectory()) {
        entries.push({
          archivePath: `${archivePath}/`,
          sourcePath,
          type: 'directory',
          size: 0,
          mode: 0o755,
        });
        visit(sourcePath, relativePath);
      } else if (stat.isFile()) {
        entries.push({
          archivePath,
          sourcePath,
          type: 'file',
          size: stat.size,
          mode: (stat.mode & 0o111) === 0 ? 0o644 : 0o755,
        });
      } else {
        throw new Error(
          `deterministic release archives support only directories and regular files: ${sourcePath}`,
        );
      }
    }
  }

  visit(sourceDirectory, '');
  return entries;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function resolveMtime(explicitMtime) {
  const raw = explicitMtime ?? process.env.SOURCE_DATE_EPOCH ?? '0';
  if (!/^(0|[1-9][0-9]*)$/.test(String(raw))) {
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer');
  }
  const mtime = Number(raw);
  if (!Number.isSafeInteger(mtime) || mtime > maximumTarNumber) {
    throw new Error('SOURCE_DATE_EPOCH is outside the portable ustar range');
  }
  return mtime;
}

function validateArchivePath(value) {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`unsafe archive path: ${value}`);
  }
  splitArchivePath(value.endsWith('/') ? value.slice(0, -1) : value);
}

function splitArchivePath(archivePath) {
  if (Buffer.byteLength(archivePath) <= 100) {
    return { name: archivePath, prefix: '' };
  }
  const separators = [];
  for (let index = 0; index < archivePath.length; index += 1) {
    if (archivePath[index] === '/') separators.push(index);
  }
  for (const index of separators.reverse()) {
    const prefix = archivePath.slice(0, index);
    const name = archivePath.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`archive path does not fit the portable ustar format: ${archivePath}`);
}

function createHeader({ path, type, size, mode, mtime }) {
  const directory = type === 'directory';
  const normalizedPath = directory && path.endsWith('/') ? path.slice(0, -1) : path;
  const { name, prefix } = splitArchivePath(normalizedPath);
  const header = Buffer.alloc(blockSize);

  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, mtime);
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, directory ? '5' : '0');
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'root');
  writeString(header, 297, 32, 'root');
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);
  writeString(header, 345, 155, prefix);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumField = `${checksum.toString(8).padStart(6, '0')}\0 `;
  header.write(checksumField, 148, 8, 'ascii');
  return header;
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value);
  if (bytes.length > length) {
    throw new Error(`tar field exceeds ${length} bytes: ${value}`);
  }
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximumTarNumber) {
    throw new Error(`value is outside the portable ustar range: ${value}`);
  }
  const encoded = `${value.toString(8).padStart(length - 1, '0')}\0`;
  if (encoded.length !== length) {
    throw new Error(`value does not fit a ${length}-byte tar field: ${value}`);
  }
  buffer.write(encoded, offset, length, 'ascii');
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return;
  await new Promise((resolveDrain, rejectDrain) => {
    const onDrain = () => {
      stream.off('error', onError);
      resolveDrain();
    };
    const onError = (error) => {
      stream.off('drain', onDrain);
      rejectDrain(error);
    };
    stream.once('drain', onDrain);
    stream.once('error', onError);
  });
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cuttledoc-deterministic-tar-'));
  try {
    const firstSource = join(root, 'first', 'package');
    const secondSource = join(root, 'second', 'package');
    for (const source of [firstSource, secondSource]) {
      mkdirSync(join(source, 'nested'), { recursive: true });
      writeFileSync(join(source, 'README.md'), 'reproducible\n');
      writeFileSync(join(source, 'nested', 'cuttledoc'), '#!/bin/sh\nexit 0\n');
      chmodSync(join(source, 'nested', 'cuttledoc'), 0o755);
    }
    utimesSync(firstSource, 1, 1);
    utimesSync(join(firstSource, 'README.md'), 2, 2);
    utimesSync(secondSource, 10_000, 10_000);
    utimesSync(join(secondSource, 'README.md'), 20_000, 20_000);

    const firstArchive = join(root, 'first.tar.gz');
    const secondArchive = join(root, 'second.tar.gz');
    await createDeterministicTarGz(firstSource, firstArchive, { mtime: 123 });
    await createDeterministicTarGz(secondSource, secondArchive, { mtime: 123 });

    const firstDigest = sha256(firstArchive);
    const secondDigest = sha256(secondArchive);
    if (firstDigest !== secondDigest) {
      throw new Error('self-test archives are not byte-identical');
    }
    const tar = gunzipSync(readFileSync(firstArchive));
    if (
      tar.length % blockSize !== 0 ||
      tar.subarray(-blockSize * 2).some((byte) => byte !== 0) ||
      !tar.includes(Buffer.from('package/nested/cuttledoc'))
    ) {
      throw new Error('self-test archive does not contain a valid tar terminator or entries');
    }

    let rejectedUnsafePath = false;
    const unsafeSource = join(root, 'unsafe');
    mkdirSync(unsafeSource);
    const unsafeOutput = join(root, 'unsafe.tar.gz');
    try {
      await createDeterministicTarGz(unsafeSource, unsafeOutput, {
        mtime: 'invalid',
      });
    } catch {
      rejectedUnsafePath = true;
    }
    if (!rejectedUnsafePath) {
      throw new Error('self-test accepted an invalid timestamp');
    }

    console.log(`Deterministic tar self-test passed: ${firstDigest}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (
  invokedPath !== undefined &&
  pathToFileURL(invokedPath).href === import.meta.url
) {
  if (process.argv[2] === '--self-test') {
    await selfTest();
  } else if (process.argv.length === 4) {
    await createDeterministicTarGz(process.argv[2], process.argv[3]);
    console.log(resolve(process.argv[3]));
  } else {
    console.error(
      `usage: node ${fileURLToPath(import.meta.url)} SOURCE_DIRECTORY OUTPUT.tar.gz`,
    );
    console.error(
      `       node ${fileURLToPath(import.meta.url)} --self-test`,
    );
    process.exitCode = 2;
  }
}
