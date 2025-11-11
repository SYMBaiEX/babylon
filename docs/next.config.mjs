import nextra from 'nextra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  latex: true,
  search: {
    codeblocks: true
  },
  defaultShowCopyCode: true
})

export default withNextra({
  output: 'standalone',
  // Configure base path if deploying to subdomain
  // basePath: '/docs',
  images: {
    unoptimized: true
  },
  // Silence workspace root warning
  outputFileTracingRoot: path.join(__dirname, '..')
})

