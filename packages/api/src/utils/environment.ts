/**
 * Deployment Environment Utilities
 *
 * Utilities for determining the current deployment environment
 * based on Vercel and Node.js environment variables.
 */

export type DeploymentEnvironment = 'production' | 'staging' | 'development';

/**
 * Get current deployment environment
 *
 * Determines environment based on:
 * 1. VERCEL_ENV (production, preview, development)
 * 2. NODE_ENV as fallback
 *
 * @returns The current deployment environment
 */
export function getDeploymentEnvironment(): DeploymentEnvironment {
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'staging';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

/**
 * Whether to prefer the `privy-token` HttpOnly cookie over the Authorization header
 * when resolving auth tokens.
 *
 * Policy:
 * - **Production**: cookies (HttpOnly, auto-refreshed by Privy SDK)
 * - **Staging / local**: Authorization header (easier for testing, external clients)
 *
 * Override with `PRIVY_AUTH_PREFER_COOKIE=true|false` when needed.
 */
export function preferCookieAuth(): boolean {
  const override = process.env.PRIVY_AUTH_PREFER_COOKIE;
  if (override !== undefined) {
    return ['true', '1', 'yes', 'on'].includes(override.toLowerCase());
  }
  return getDeploymentEnvironment() === 'production';
}
