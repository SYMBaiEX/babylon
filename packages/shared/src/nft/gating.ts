const EXACT_ALLOWLIST = new Set<string>([
  // Pages
  '/nft',
  '/share',
  '/api-docs',
  '/mcp',
  '/.well-known',

  // API routes (exact)
  '/api/users/me',
  '/api/users/signup',
  '/api/upload',
]);

const PREFIX_ALLOWLIST = [
  // Pages
  '/nft/',
  '/share/',
  '/api-docs/',
  '/.well-known/',

  // API routes
  '/api/nft/',
  '/api/og/',
  '/api/auth/',
  '/api/users/onboarding/',
  '/api/onboarding/',
  '/api/upload/',
  '/api/waitlist/',
] as const;

export function isNftGatingAllowlistedPath(pathname: string): boolean {
  if (EXACT_ALLOWLIST.has(pathname)) return true;
  return PREFIX_ALLOWLIST.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Check if NFT gating is enabled via environment variable.
 * Accepts: 'true', '1', 'yes', 'on' (case-insensitive)
 */
export function isNftGatingEnabled(): boolean {
  const flag = process.env.NFT_GATING_ENABLED ?? '';
  return ['true', '1', 'yes', 'on'].includes(flag.toLowerCase());
}
