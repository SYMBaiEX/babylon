/**
 * Sentry Server Configuration
 * 
 * This file configures Sentry for the server-side of the Next.js application.
 * It captures errors from API routes, server components, and server-side rendering.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: process.env.NODE_ENV === 'development',
  
  // Set environment
  environment: process.env.NODE_ENV || 'development',
  
  // Release tracking (set via environment variable or CI/CD)
  release: process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  
  // Filter out common non-actionable errors
  ignoreErrors: [
    // Prisma connection errors (handled separately)
    'PrismaClientInitializationError',
    // Validation errors (handled by error handler)
    'ZodError',
    // Authentication errors (handled by error handler)
    'UnauthorizedError',
  ],
  
  // Additional options
  beforeSend(event, hint) {
    // Don't send events if DSN is not configured
    if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }
    
    // Add additional context
    if (event.request) {
      // Add user context if available
      const userId = event.request.headers?.['x-user-id']
      if (userId) {
        event.user = {
          id: userId as string,
        }
      }
    }
    
    return event
  },
  
  // Server-specific integrations
  integrations: [
    // Automatically instrument Node.js modules
    Sentry.httpIntegration(),
  ],
})

