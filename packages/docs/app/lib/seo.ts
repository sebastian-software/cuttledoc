import type { MetaDescriptor } from 'react-router'

import siteConfig from '../../site.config.json'

export const ogImageUrl = `${siteConfig.siteUrl}/og-image.png`

export function getCanonicalUrl(pathname: string): string {
  const sitePath = new URL(siteConfig.siteUrl).pathname.replace(/\/$/, '')
  let routePath = pathname.split(/[?#]/, 1)[0] || '/'

  if (routePath === sitePath) {
    routePath = '/'
  } else if (routePath.startsWith(`${sitePath}/`)) {
    routePath = routePath.slice(sitePath.length)
  }

  if (!routePath.startsWith('/')) routePath = `/${routePath}`
  if (routePath !== '/') routePath = routePath.replace(/\/$/, '')

  return routePath === '/' ? `${siteConfig.siteUrl}/` : `${siteConfig.siteUrl}${routePath}`
}

interface SeoMetaOptions {
  title?: string
  description?: string
  pathname: string
}

export function createSeoMeta({
  title = siteConfig.defaultTitle,
  description = siteConfig.defaultDescription,
  pathname
}: SeoMetaOptions): MetaDescriptor[] {
  const canonicalUrl = getCanonicalUrl(pathname)

  return [
    { title },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
    { property: 'og:site_name', content: siteConfig.siteName },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonicalUrl },
    { property: 'og:image', content: ogImageUrl },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: siteConfig.socialImageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: ogImageUrl },
    { name: 'twitter:image:alt', content: siteConfig.socialImageAlt }
  ]
}

export { siteConfig }
