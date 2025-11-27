/**
 * PostHog Server Client
 * Server-side analytics and event tracking for API routes
 */

import { PostHog } from 'posthog-node';
import { logger } from '@/lib/logger';

let posthogClient: PostHog | null = null;

/**
 * Handle PostHog errors gracefully without blocking
 */
function handlePostHogError(error: Error, context: string): void {
  // Only log in development to avoid noise in production logs
  // PostHog errors are non-critical and shouldn't block operations
  if (process.env.NODE_ENV === 'development') {
    logger.warn(
      `PostHog ${context} error (non-blocking)`,
      {
        error: error.message,
        name: error.name,
      },
      'PostHog'
    );
  }
}

export const getPostHogServerClient = (): PostHog | null => {
  // Only initialize on server
  if (typeof window !== 'undefined') return null;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn(
      'PostHog Server: API key not found. Server-side analytics will be disabled.'
    );
    return null;
  }

  // Singleton pattern
  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host: apiHost,
      flushAt: 20, // Flush after 20 events
      flushInterval: 10000, // Flush every 10 seconds
      // Timeout for network requests (5 seconds for serverless)
      requestTimeout: 5000,

      // Important: Always shutdown gracefully to ensure events are sent
      // Use in API routes: await posthog.shutdown() before returning
      // Note: PostHog errors are handled via try-catch in our wrapper functions
      // and timeout wrappers to prevent blocking in serverless environments
    });
  }

  return posthogClient;
};

/**
 * Track server-side event
 */
export const trackServerEvent = async (
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) => {
  const client = getPostHogServerClient();
  if (!client) return;

  try {
    client.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        $lib: 'posthog-node',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently handle capture errors - don't block the request
    handlePostHogError(
      error instanceof Error ? error : new Error(String(error)),
      'capture'
    );
  }
};

/**
 * Identify user on server
 */
export const identifyServerUser = async (
  distinctId: string,
  properties: Record<string, unknown>
) => {
  const client = getPostHogServerClient();
  if (!client) return;

  try {
    client.identify({
      distinctId,
      properties,
    });
  } catch (error) {
    // Silently handle identify errors - don't block the request
    handlePostHogError(
      error instanceof Error ? error : new Error(String(error)),
      'identify'
    );
  }
};

/**
 * Track API error
 */
export const trackServerError = async (
  distinctId: string | null,
  error: Error,
  context: {
    endpoint: string;
    method: string;
    statusCode?: number;
    [key: string]: unknown;
  }
) => {
  const client = getPostHogServerClient();
  if (!client) return;

  try {
    const { endpoint, method, statusCode, ...otherContext } = context;

    client.capture({
      distinctId: distinctId || 'anonymous',
      event: '$exception',
      properties: {
        $exception_type: error.name || 'Error',
        $exception_message: error.message,
        $exception_stack: error.stack,
        endpoint,
        method,
        statusCode,
        ...otherContext,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (trackError) {
    // Silently handle tracking errors - don't block error reporting
    handlePostHogError(
      trackError instanceof Error ? trackError : new Error(String(trackError)),
      'error-tracking'
    );
  }
};

/**
 * Flush all pending events (important for serverless functions)
 * Wraps flush in timeout and error handling to prevent blocking
 */
export const flushPostHog = async () => {
  const client = getPostHogServerClient();
  if (!client) return;

  try {
    // Wrap flush in a timeout to prevent hanging
    const flushPromise = client.flush();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('PostHog flush timeout')), 3000);
    });

    await Promise.race([flushPromise, timeoutPromise]);
  } catch (error) {
    // Silently handle timeout/network errors - don't block the response
    // Log only in development to avoid noise in production
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'PostHog flush failed (non-blocking):',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
};

/**
 * Shutdown PostHog client gracefully
 * Wraps shutdown in timeout and error handling to prevent blocking
 */
export const shutdownPostHog = async () => {
  if (!posthogClient) return;

  try {
    // Wrap shutdown in a timeout to prevent hanging
    const shutdownPromise = posthogClient.shutdown();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('PostHog shutdown timeout')), 3000);
    });

    await Promise.race([shutdownPromise, timeoutPromise]);
  } catch (error) {
    // Silently handle timeout/network errors - don't block the response
    // Log only in development to avoid noise in production
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'PostHog shutdown failed (non-blocking):',
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    posthogClient = null;
  }
};
