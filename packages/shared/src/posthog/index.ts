/**
 * PostHog Utilities
 *
 * @description PostHog analytics and event tracking (client and server)
 * 
 * NOTE: Server-side utilities are NOT exported from this barrel file to prevent
 * webpack from bundling posthog-node into client builds. Server code should
 * import directly from './server' when needed on the server:
 * 
 * import { trackServerEvent } from '@babylon/shared/src/posthog/server';
 */

// Client-side utilities only
// Server-side code should import directly from './server' to avoid bundling issues
export { initPostHog, posthog, getPostHog } from './client';

// Re-export types that are safe for both client and server
export type {
  PostHogServerClient,
  PostHogClient,
} from '../types/common';

