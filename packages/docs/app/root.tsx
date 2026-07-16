import { RootProvider } from 'fumadocs-ui/provider/react-router'
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'

import type { Route } from './+types/root'

import './app.css'
import SearchDialog from './components/search'
import { createSeoMeta, siteConfig } from './lib/seo'

export function meta({ location, error }: Route.MetaArgs) {
  if (error) {
    const notFound = isRouteErrorResponse(error) && error.status === 404

    return [
      ...createSeoMeta({
        title: `${notFound ? 'Page Not Found' : 'Error'} | ${siteConfig.siteName}`,
        description: notFound
          ? 'The requested cuttledoc documentation page could not be found.'
          : 'An unexpected error occurred while loading the cuttledoc documentation.',
        pathname: location.pathname
      }),
      { name: 'robots', content: 'noindex' }
    ]
  }

  return createSeoMeta({ pathname: location.pathname })
}

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: `${import.meta.env.BASE_URL}favicon.ico` },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous'
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap'
  }
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={{ SearchDialog }}>{children}</RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!'
  let details = 'An unexpected error occurred.'
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error'
    details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="pt-16 p-4 w-full max-w-[1400px] mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
