import type { MetaDescriptor } from 'react-router'

const canonicalRoot = 'https://sebastian-software.github.io/cuttledoc'
const defaultDescription =
  'Fast, offline speech-to-text transcription library for Node.js with multiple backends and LLM enhancement.'
const defaultTitle = 'cuttledoc - Fast Offline Speech-to-Text for Node.js'
const socialImage = `${canonicalRoot}/og-image.png`
const pages: Record<string, { title: string; description: string }> = {
  '/': { title: defaultTitle, description: defaultDescription },
  '/docs': {
    title: 'Getting Started | cuttledoc',
    description: 'Install cuttledoc and create your first local or cloud transcript'
  },
  '/docs/api': {
    title: 'API Reference | cuttledoc',
    description: 'Public APIs for transcription and LLM enhancement'
  },
  '/docs/backends': {
    title: 'Backends | cuttledoc',
    description: 'Choose and configure local CoreML or OpenAI speech-to-text backends'
  },
  '/docs/benchmarks': {
    title: 'Benchmarks | cuttledoc',
    description: 'Speech recognition and LLM correction accuracy, speed, and methodology'
  },
  '/docs/cli': {
    title: 'CLI Reference | cuttledoc',
    description: 'Commands and options for transcription, model management, and benchmarking'
  },
  '/docs/llm': {
    title: 'LLM Enhancement | cuttledoc',
    description: 'Improve transcription quality with AI-powered post-processing'
  },
  '/docs/models': {
    title: 'Model Management | cuttledoc',
    description: 'List and download speech and embedded LLM models used by cuttledoc'
  },
  '/docs/troubleshooting': {
    title: 'Troubleshooting | cuttledoc',
    description: 'Solutions for platform, model, FFmpeg, OpenAI, LLM, and benchmark problems'
  }
}

export function createSeoMetaForPath(pathname: string): MetaDescriptor[] {
  const path = normalizeRoutePath(pathname)
  const page = pages[path] ?? {
    title: 'Page Not Found | cuttledoc',
    description: 'The requested cuttledoc documentation page could not be found.'
  }
  const canonicalUrl = path === '/' ? `${canonicalRoot}/` : `${canonicalRoot}${path}`
  const entries: MetaDescriptor[] = [
    { title: page.title },
    { name: 'description', content: page.description },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
    { property: 'og:site_name', content: 'cuttledoc' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: page.title },
    { property: 'og:description', content: page.description },
    { property: 'og:url', content: canonicalUrl },
    { property: 'og:image', content: socialImage },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: 'cuttledoc - Fast offline speech-to-text for Node.js' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: page.title },
    { name: 'twitter:description', content: page.description },
    { name: 'twitter:image', content: socialImage },
    { name: 'twitter:image:alt', content: 'cuttledoc - Fast offline speech-to-text for Node.js' }
  ]

  if (!(path in pages)) entries.push({ name: 'robots', content: 'noindex' })
  return entries
}

function normalizeRoutePath(pathname: string): string {
  let path = pathname.split(/[?#]/, 1)[0] || '/'
  if (path === '/cuttledoc' || path === '/cuttledoc/') return '/'
  if (path.startsWith('/cuttledoc/')) path = path.slice('/cuttledoc'.length)
  return path.length > 1 ? path.replace(/\/$/, '') : path
}
