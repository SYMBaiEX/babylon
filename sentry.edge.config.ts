/**
 * Sentry Edge Configuration
 * 
 * This file configures Sentry for Edge runtime (middleware, edge functions).
 * Edge runtime has limited APIs, so configuration is minimal.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Lower sample rate for edge functions (they can be high volume)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
  
  // Set environment
  environment: process.env.NODE_ENV || 'development',
  
  // Release tracking
  release: process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  
  // Edge runtime has limited capabilities
  beforeSend(event) {
    // Don't send events if DSN is not configured
    if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }
    
    return event
  },
})

