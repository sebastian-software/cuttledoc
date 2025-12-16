#!/usr/bin/env node

/**
 * Syncs the version from root package.json to all publishable packages
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))
const version = rootPkg.version

const packages = ['packages/cuttledoc', 'packages/cli']

for (const pkg of packages) {
  const pkgPath = join(rootDir, pkg, 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkgJson.version = version
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n')
  console.log(`Updated ${pkg}/package.json to v${version}`)
}

