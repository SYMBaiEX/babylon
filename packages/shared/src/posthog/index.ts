/**
 * PostHog Utilities
 *
 * @description PostHog analytics and event tracking (client and server)
 */

// Client-side utilities
export { initPostHog, posthog } from './client';

// Server-side utilities
export {
  getPostHogServerClient,
  trackServerEvent,
  identifyServerUser,
  trackServerError,
  flushPostHog,
  shutdownPostHog,
} from './server';

