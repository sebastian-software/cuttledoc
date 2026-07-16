import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import mdx from 'fumadocs-mdx/vite'
import * as MdxConfig from './source.config'

const basePath = process.env.BASE_PATH?.replace(/\/?$/, '/') || '/'

export default defineConfig({
  base: basePath,
  resolve: {
    tsconfigPaths: true
  },
  plugins: [mdx(MdxConfig), tailwindcss(), reactRouter()]
})
