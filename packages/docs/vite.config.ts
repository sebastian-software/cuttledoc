import { ardo } from 'ardo/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    ardo({
      title: 'cuttledoc',
      description:
        'Fast, offline speech-to-text transcription library for Node.js with multiple backends and LLM enhancement.',
      siteUrl: 'https://sebastian-software.github.io',
      brand: {
        color: 'orange',
        accent: 'amber',
        neutral: 'slate',
        logo: './app/assets/logo.svg'
      },
      metadata: {
        image: 'https://sebastian-software.github.io/cuttledoc/og-image.png',
        ogType: 'website',
        twitterCard: 'summary_large_image'
      },
      sidebar: {
        sectionOrder: ['docs']
      },
      seo: {
        sitemap: { changefreq: 'weekly', priority: 0.7 },
        robots: { allow: ['/'] },
        llms: {
          title: 'cuttledoc documentation',
          description: 'Guides and API reference for cuttledoc.',
          includeFull: true
        }
      },
      linkCheck: { level: 'error' },
      validation: {
        frontmatter: { invalid: 'error', unknown: 'error' }
      },
      icons: { source: './app/assets/logo.svg' },
      githubPages: true,
      project: {
        name: 'cuttledoc',
        homepage: 'https://sebastian-software.github.io/cuttledoc/',
        repository: 'https://github.com/sebastian-software/cuttledoc',
        license: 'MIT'
      }
    })
  ]
})
