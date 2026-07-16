import { useFumadocsLoader } from 'fumadocs-core/source/client'
import browserCollections from 'fumadocs-mdx:collections/browser'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'

import type { Route } from './+types/page'

import { baseOptions } from '../lib/layout.shared'
import { createSeoMeta, siteConfig } from '../lib/seo'
import { source } from '../lib/source'

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params['*'].split('/').filter((v) => v.length > 0)
  const page = source.getPage(slugs)
  if (!page) {
    // React Router convention for 404 responses
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response('Not found', { status: 404 })
  }

  return {
    path: page.path,
    title: page.data.title,
    description: page.data.description,
    pageTree: await source.serializePageTree(source.pageTree)
  }
}

export function meta({ data, location }: Route.MetaArgs) {
  if (!data) return createSeoMeta({ pathname: location.pathname })

  return createSeoMeta({
    title: `${data.title} | ${siteConfig.siteName}`,
    description: data.description,
    pathname: location.pathname
  })
}

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, default: Mdx, frontmatter }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <Mdx components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </DocsPage>
    )
  }
})

export default function Page({ loaderData }: Route.ComponentProps) {
  const Content = clientLoader.getComponent(loaderData.path)
  const { pageTree } = useFumadocsLoader(loaderData)

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Content />
    </DocsLayout>
  )
}
