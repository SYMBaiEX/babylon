/**
 * PostHog Client Configuration
 * Client-side analytics and event tracking
 */

import type {
  PostHogClient,
  StringRecord,
  JsonValue,
} from '../types/common';

// PostHog is an optional peer dependency
// Use lazy initialization with dynamic import to avoid bundling issues
let posthog: PostHogClient | null = null;
let posthogInitPromise: Promise<PostHogClient | null> | null = null;

/**
 * Lazily load and initialize the PostHog client.
 * Uses dynamic import to ensure webpack can tree-shake this in server builds.
 */
async function loadPostHog(): Promise<PostHogClient | null> {
  if (typeof window === 'undefined') return null;
  if (posthog) return posthog;
  
  if (!posthogInitPromise) {
    posthogInitPromise = (async () => {
      try {
        const module = await import('posthog-js');
        // posthog-js exports the constructor as default
        // The module.default is a function that returns a PostHogClient
        const PostHogConstructor = module.default as unknown as () => PostHogClient;
        posthog = PostHogConstructor();
        return posthog;
      } catch {
        // PostHog not available
        return null;
      }
    })();
  }
  
  return posthogInitPromise;
}

// Initialize PostHog immediately on client-side (non-blocking)
if (typeof window !== 'undefined') {
  loadPostHog();
}

export const initPostHog = async (): Promise<PostHogClient | null> => {
  if (typeof window === 'undefined') return null;

  // Wait for PostHog to be loaded
  const client = await loadPostHog();
  if (!client) return null;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn('PostHog: API key not found. Analytics will be disabled.');
    return null;
  }

  // Initialize PostHog only once
  if (!client.__loaded) {
    client.init(apiKey, {
      api_host: apiHost,

      // Capture settings
      capture_pageview: false, // We'll handle this manually for better control
      capture_pageleave: true, // Track when users leave pages

      // Session recording
      session_recording: {
        maskAllInputs: true, // Mask sensitive input fields
        maskTextSelector: '[data-private]', // Custom selector for privacy
        recordCrossOriginIframes: false,
      },

      // Autocapture
      autocapture: {
        dom_event_allowlist: ['click', 'submit', 'change'], // Only capture specific events
        url_allowlist: [], // Allow all URLs
        element_allowlist: ['button', 'a', 'form'], // Only important elements
        css_selector_allowlist: ['[data-ph-capture]'], // Custom tracking attribute
      },

      // Performance
      loaded: () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('PostHog initialized successfully');
        }
      },

      // Privacy
      respect_dnt: true, // Respect Do Not Track
      persistence: 'localStorage+cookie', // Store data in localStorage and cookies

      // Advanced features
      enable_recording_console_log: process.env.NODE_ENV === 'development', // Log console in dev

      // Error tracking
      capture_exceptions: true, // Automatically capture errors

      // Properties
      sanitize_properties: (properties: StringRecord<JsonValue>) => {
        // Remove sensitive data from properties
        const sanitized = { ...properties };
        if (
          sanitized.$set &&
          typeof sanitized.$set === 'object' &&
          sanitized.$set !== null &&
          !Array.isArray(sanitized.$set)
        ) {
          const $set = sanitized.$set as StringRecord<JsonValue>;
          delete $set.email;
          delete $set.password;
        }
        return sanitized;
      },
    });
  }

  return client;
};

/**
 * Get the PostHog client synchronously.
 * Returns null if PostHog hasn't been loaded yet.
 * Use initPostHog() for guaranteed client access.
 */
export const getPostHog = (): PostHogClient | null => posthog;

// Export posthog as a getter that returns the current client (may be null during initial load)
export { posthog };

