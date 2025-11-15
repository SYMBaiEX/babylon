/**
 * Next.js Instrumentation
 * 
 * Runs on server startup to register Babylon in Agent0 registry and initialize Sentry.
 * For Next.js 16.0.1, this file handles server-side Sentry initialization.
 * 
 * Note: Client-side Sentry is initialized via instrumentation-client.ts
 */

import * as Sentry from '@sentry/nextjs'

export async function register() {
  // Skip instrumentation during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return
  }
  
  // Initialize Sentry for server-side (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  
  // Temporarily disabled to prevent blocking dev server
  // Re-enable when agent0-sdk is properly installed
  // Use dynamic import to avoid loading Node.js-specific code in Edge Runtime
  // This prevents static analyzer warnings about process.argv and other Node.js APIs
  if (false && process.env.NEXT_RUNTIME === 'nodejs') {
    // Register Babylon game (will skip if already registered or disabled)
    // Dynamic import ensures babylon-registry-init.ts (and prisma.ts) are only loaded in Node.js runtime
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

