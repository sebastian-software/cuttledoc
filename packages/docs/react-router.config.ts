import type { Config } from '@react-router/dev/config'

const basename = process.env.BASE_PATH?.replace(/\/$/, '') || ''

export default {
  ssr: false,
  basename,
  prerender: false
} satisfies Config
