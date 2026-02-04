import path from 'node:path';
import nextra from 'nextra';

// Next.js runs from `apps/docs`, so go up two levels for the monorepo root.
const monorepoRoot = path.resolve(process.cwd(), '../..');

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: true,
  },
  defaultShowCopyCode: true,
});

export default withNextra({
  output: 'standalone',
  // Explicitly set the monorepo root to avoid lockfile/root inference warnings.
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    unoptimized: true,
  },
  // Use trailing slash to avoid [[...mdxPath]].html generation warning
  trailingSlash: true,
  // Enable cache components for Next.js 16
  cacheComponents: true,
  // Redirect root to documentation
  async redirects() {
    return [
      {
        source: '/',
        destination: '/documentation',
        permanent: false,
      },
    ];
  },
});
