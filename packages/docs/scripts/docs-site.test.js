import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const buildRoot = new URL('../build/client/', import.meta.url)
const canonicalRoot = 'https://sebastian-software.github.io/cuttledoc'
const routes = [
  '/',
  '/docs',
  '/docs/api',
  '/docs/backends',
  '/docs/benchmarks',
  '/docs/cli',
  '/docs/llm',
  '/docs/models',
  '/docs/troubleshooting'
]

function outputUrl(route) {
  return new URL(route === '/' ? 'index.html' : `${route.slice(1)}/index.html`, buildRoot)
}

test('every established public route is prerendered with canonical metadata', async () => {
  for (const route of routes) {
    const html = await readFile(outputUrl(route), 'utf8')
    const canonical = route === '/' ? `${canonicalRoot}/` : `${canonicalRoot}${route}`

    assert.ok(html.includes(`rel="canonical" href="${canonical}"`), `missing canonical for ${route}`)
    assert.match(html, /href="\/cuttledoc\/assets\//)
  }
})

test('ARDO emits complete SEO and offline search artifacts', async () => {
  const [sitemap, robots, searchManifest] = await Promise.all([
    readFile(new URL('sitemap.xml', buildRoot), 'utf8'),
    readFile(new URL('robots.txt', buildRoot), 'utf8'),
    readFile(new URL('search/manifest.json', buildRoot), 'utf8').then(JSON.parse)
  ])

  for (const route of routes) {
    const canonical = route === '/' ? `${canonicalRoot}/` : `${canonicalRoot}${route}`
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `sitemap is missing ${canonical}`)
  }

  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Allow: \/$/m)
  assert.ok(robots.includes(`Sitemap: ${canonicalRoot}/sitemap.xml`))
  assert.equal(searchManifest.version, 2)
  assert.ok(searchManifest.recordCount > routes.length)
  assert.equal(searchManifest.chunks.length, 1)
  await stat(new URL(searchManifest.chunks[0].file, buildRoot))
})

test('social preview, favicon, and GitHub Pages fallback are preserved', async () => {
  const [image, home, fallback] = await Promise.all([
    readFile(new URL('og-image.png', buildRoot)),
    readFile(new URL('index.html', buildRoot), 'utf8'),
    readFile(new URL('404.html', buildRoot), 'utf8')
  ])

  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(image.readUInt32BE(16), 1200)
  assert.equal(image.readUInt32BE(20), 630)
  assert.ok(home.includes(`${canonicalRoot}/og-image.png`))
  assert.match(fallback, /<meta name="robots" content="noindex" \/>/)
  await Promise.all([
    stat(new URL('favicon.ico', buildRoot)),
    stat(new URL('icon.svg', buildRoot)),
    stat(new URL('apple-touch-icon.png', buildRoot))
  ])
})
