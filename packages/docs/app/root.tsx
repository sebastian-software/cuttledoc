import {
  ArdoErrorBoundary,
  ArdoFooter,
  ArdoGeneratedSidebar,
  ArdoHeader,
  ArdoHeaderActions,
  ArdoNav,
  ArdoNavLink,
  ArdoRoot,
  ArdoRootLayout,
  ArdoSidebar,
  ArdoSidebarSection,
  ArdoSocialLink
} from 'ardo/ui'
import config from 'virtual:ardo/config'
import type { MetaFunction } from 'react-router'
import 'ardo/ui/styles.css'
import './app.css'
import { createSeoMetaForPath } from './seo'

export const meta: MetaFunction = ({ location }) => createSeoMetaForPath(location.pathname)

export function Layout({ children }: { children: React.ReactNode }) {
  return <ArdoRootLayout>{children}</ArdoRootLayout>
}

export function ErrorBoundary() {
  return (
    <ArdoErrorBoundary
      notFound={{
        title: 'Page Not Found',
        description: 'The requested cuttledoc documentation page could not be found.'
      }}
      error={{
        title: 'Something went wrong',
        description: 'An unexpected error occurred while loading the cuttledoc documentation.'
      }}
    />
  )
}

export default function Root() {
  return (
    <ArdoRoot
      config={config}
      editLink={{
        pattern: 'https://github.com/sebastian-software/cuttledoc/edit/main/packages/docs/app/routes/:path',
        text: 'Edit this page on GitHub'
      }}
      lastUpdated={{ enabled: true, text: 'Last updated' }}
    >
      <ArdoHeader searchPlaceholder="Search cuttledoc documentation...">
        <ArdoNav>
          <ArdoNavLink to="/docs">Documentation</ArdoNavLink>
          <ArdoNavLink to="/docs/api">API</ArdoNavLink>
        </ArdoNav>
        <ArdoHeaderActions>
          <ArdoSocialLink href="https://github.com/sebastian-software/cuttledoc" icon="github" />
        </ArdoHeaderActions>
      </ArdoHeader>

      <ArdoSidebar>
        <ArdoSidebarSection id="docs" label="Documentation" to="/docs">
          <ArdoGeneratedSidebar section="docs" />
        </ArdoSidebarSection>
      </ArdoSidebar>

      <ArdoFooter
        sponsor={{ text: 'Sebastian Software', link: 'https://oss.sebastian-software.com' }}
        message="Released under the MIT License."
        copyright="Copyright 2026 Sebastian Software GmbH"
      />
    </ArdoRoot>
  )
}
