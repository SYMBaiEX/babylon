import nextra from 'nextra'

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: true
  },
  defaultShowCopyCode: true
})

export default withNextra({
  output: 'standalone',
  images: {
    unoptimized: true
  }
})

