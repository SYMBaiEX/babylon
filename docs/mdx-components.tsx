import type { MDXComponents } from 'mdx/types'
import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'

const docsComponents = getDocsMDXComponents()

// Import SwaggerUI directly - it's already a client component
import SwaggerUI from './components/SwaggerUI'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...docsComponents,
    SwaggerUI,
    ...components
  }
}
