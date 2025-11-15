/**
 * Next.js Instrumentation
 * 
 * Runs on server startup to register Babylon in Agent0 registry and initialize Sentry.
 * For Next.js 16.0.1, this file handles server-side Sentry initialization.
 * 
 * Note: Client-side Sentry is initialized via instrumentation-client.ts
 */

import * as Sentry from '@sentry/nextjs'

const sentryDisabled =
  process.env.DISABLE_SENTRY === 'true' ||
  process.env.NEXT_PUBLIC_DISABLE_SENTRY === 'true'

export async function register() {
  // Skip instrumentation during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return
  }
  
  if (sentryDisabled && process.env.NODE_ENV === 'development') {
    console.info('[Sentry] Disabled via DISABLE_SENTRY flag')
  }
  
  // Initialize Sentry for server-side (Node.js runtime)
  if (!sentryDisabled && process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  
  // Temporarily disabled to prevent blocking dev server
  // Re-enable when agent0-sdk is properly installed
  if (
    !sentryDisabled &&
    false &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    const { registerBabylonGame } = await import('./src/lib/babylon-registry-init')
    await registerBabylonGame().catch((error: Error) => {
      // Don't fail startup if registration fails
      console.error('Failed to register Babylon game on startup:', error)
      // Capture error in Sentry if available
      if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.captureException(error)
      }
    })
  }
}

// Export request error handler for Next.js App Router
export const onRequestError = Sentry.captureRequestError
