import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src="/logo.svg" alt="cuttledoc" className="h-7 w-7" />
          <span className="font-semibold">cuttledoc</span>
        </>
      ),
    },
    links: [
      {
        text: 'Documentation',
        url: '/docs',
        active: 'nested-url',
      },
      {
        text: 'GitHub',
        url: 'https://github.com/sebastian-software/cuttledoc',
        external: true,
      },
    ],
    githubUrl: 'https://github.com/sebastian-software/cuttledoc',
  };
}
