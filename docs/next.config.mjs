import nextra from 'nextra'

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: true
  },
  defaultShowCopyCode: true,
  contentDirBasePath: "/docs"
})

export default withNextra({
  output: 'standalone',
  images: {
    unoptimized: true
  }
})

