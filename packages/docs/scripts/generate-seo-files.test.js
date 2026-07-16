import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { getPublicRoutes } from './generate-seo-files.js'

const docsRoot = new URL('../', import.meta.url)
const publicRoot = new URL('public/', docsRoot)
const siteConfig = JSON.parse(await readFile(new URL('site.config.json', docsRoot), 'utf8'))

test('sitemap covers every public prerender route', async () => {
  const routes = await getPublicRoutes()
  const sitemap = await readFile(new URL('sitemap.xml', publicRoot), 'utf8')
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  const expectedUrls = routes.map((route) =>
    route === '/' ? `${siteConfig.siteUrl}/` : `${siteConfig.siteUrl}${route}`
  )

  assert.deepEqual(sitemapUrls, expectedUrls)
  assert.equal(new Set(routes).size, routes.length)
  assert.deepEqual(routes, [...routes].sort())
})

test('robots points crawlers to the canonical sitemap', async () => {
  const robots = await readFile(new URL('robots.txt', publicRoot), 'utf8')

  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Allow: \/$/m)
  assert.ok(robots.split(/\r?\n/).includes(`Sitemap: ${siteConfig.siteUrl}/sitemap.xml`))
})

test('social preview is a 1200 by 630 PNG', async () => {
  const image = await readFile(new URL('og-image.png', publicRoot))

  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(image.readUInt32BE(16), 1200)
  assert.equal(image.readUInt32BE(20), 630)
})
