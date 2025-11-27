/**
 * PostHog Client Configuration
 * Client-side analytics and event tracking
 */

import type {
  PostHogClient,
  PostHogClientConstructor,
  StringRecord,
  JsonValue,
} from '../types/common';

// Dynamic import to avoid SSR issues
// PostHog is an optional peer dependency
let posthog: PostHogClient | null = null;

if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PostHogConstructor = require('posthog-js')
      .default as PostHogClientConstructor;
    posthog = PostHogConstructor();
  } catch {
    // PostHog not available
  }
}

export const initPostHog = () => {
  if (typeof window === 'undefined' || !posthog) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn('PostHog: API key not found. Analytics will be disabled.');
    return;
  }

  // Initialize PostHog only once
  if (!posthog?.__loaded && posthog) {
    posthog.init(apiKey, {
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

  return posthog;
};

export { posthog };

