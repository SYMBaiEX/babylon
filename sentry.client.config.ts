/**
 * Sentry Client Configuration
 * 
 * This file configures Sentry for the browser/client-side of the Next.js application.
 * It captures errors, unhandled promise rejections, and performance data from the client.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: process.env.NODE_ENV === 'development',
  
  // Enable Replay for better error context
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.1,
  
  // Filter out common non-actionable errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'originalCreateNotification',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    'atomicFindClose',
    'fb_xd_fragment',
    'bmi_SafeAddOnload',
    'EBCallBackMessageReceived',
    'conduitPage',
    // Network errors that are often not actionable
    'NetworkError',
    'Network request failed',
    'Failed to fetch',
    // Privacy/Ad blockers
    'Blocked a frame with origin',
    'ResizeObserver loop limit exceeded',
  ],
  
  // Filter out URLs that shouldn't be tracked
  denyUrls: [
    // Chrome extensions
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
  ],
  
  // Set environment
  environment: process.env.NODE_ENV || 'development',
  
  // Release tracking (set via environment variable or CI/CD)
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  
  // Additional options
  beforeSend(event, hint) {
    // Don't send events if DSN is not configured
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }
    
    // Filter out development-only errors in production
    if (process.env.NODE_ENV === 'production' && event.exception) {
      const error = hint.originalException
      if (error instanceof Error && error.message.includes('development')) {
        return null
      }
    }
    
    return event
  },
  
  // Integrate with React
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
})

