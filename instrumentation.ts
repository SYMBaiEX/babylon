/**
 * Next.js Instrumentation
 * 
 * Runs on server startup to register Babylon in Agent0 registry and initialize Sentry.
 * Only runs in Node.js runtime (not Edge).
 */

import * as Sentry from '@sentry/nextjs'
import { registerBabylonGame } from './src/lib/babylon-registry-init'

export async function register() {
  // Initialize Sentry for server-side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }

  // Temporarily disabled to prevent blocking dev server
  // Re-enable when agent0-sdk is properly installed
  if (false && process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Register Babylon game (will skip if already registered or disabled)
      await registerBabylonGame()
    } catch (error) {
      // Don't fail startup if registration fails
      console.error('Failed to register Babylon game on startup:', error)
      // Capture error in Sentry if available
      if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.captureException(error)
      }
    }
  }
}

