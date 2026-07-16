import { glob, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const docsRoot = new URL('../', import.meta.url)
const publicRoot = new URL('public/', docsRoot)
const siteConfig = JSON.parse(await readFile(new URL('site.config.json', docsRoot), 'utf8'))

function canonicalUrl(pathname) {
  return pathname === '/' ? `${siteConfig.siteUrl}/` : `${siteConfig.siteUrl}${pathname}`
}

export async function getPublicRoutes() {
  const routes = ['/']

  for await (const entry of glob('**/*.mdx', { cwd: fileURLToPath(new URL('content/docs/', docsRoot)) })) {
    const slugs = entry
      .replace(/\\/g, '/')
      .replace(/\.mdx$/, '')
      .split('/')
    if (slugs.at(-1) === 'index') slugs.pop()
    routes.push(`/docs${slugs.length > 0 ? `/${slugs.join('/')}` : ''}`)
  }

  return [...new Set(routes)].sort()
}

export async function generateSeoFiles() {
  const routes = await getPublicRoutes()
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map((route) => `  <url><loc>${canonicalUrl(route)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n')
  const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteConfig.siteUrl}/sitemap.xml`, ''].join('\n')

  await Promise.all([
    writeFile(new URL('sitemap.xml', publicRoot), sitemap),
    writeFile(new URL('robots.txt', publicRoot), robots)
  ])
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await generateSeoFiles()
}
