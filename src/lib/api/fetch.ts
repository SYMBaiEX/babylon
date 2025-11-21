/**
 * API Fetch Options
 * 
 * @description Extended fetch options with authentication and retry configuration.
 * Extends standard RequestInit with Babylon-specific options for automatic token
 * attachment and 401 retry logic.
 */
export interface ApiFetchOptions extends RequestInit {
  /**
   * When true (default), the current Privy access token is attached if available.
   */
  auth?: boolean;
  /**
   * When true (default), automatically retry with a fresh token if the request fails with 401.
   */
  autoRetryOn401?: boolean;
}

/**
 * Get a fresh Privy access token
 *
 * @description Retrieves a fresh Privy access token by calling Privy's getAccessToken().
 * Per Privy best practices, this function ALWAYS calls getAccessToken() on-demand
 * which automatically refreshes tokens nearing expiration. Never relies on cached
 * tokens which can become stale. Returns null in server-side environments.
 *
 * @see https://docs.privy.io/authentication/user-authentication/access-tokens
 * @returns {Promise<string | null>} Access token or null if unavailable
 * @private
 */
export async function getPrivyAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // ALWAYS call getAccessToken() on-demand - it auto-refreshes expired tokens
  // Per Privy best practices: never rely on cached tokens, always fetch fresh
  if (window.__privyGetAccessToken) {
    try {
      const token = await window.__privyGetAccessToken();
      return token;
    } catch {
      // If getAccessToken fails, user will be logged out by Privy automatically
      return null;
    }
  }

  // No token available - user not authenticated via Privy hook
  return null;
}

/**
 * Lightweight wrapper around fetch that decorates requests with authentication
 * 
 * @description Wrapper around fetch that automatically adds Privy access tokens
 * to requests. Centralizes authentication logic and avoids direct window lookups
 * across the codebase. Automatically retries requests with a fresh token if a
 * 401 error is received.
 * 
 * @param {RequestInfo} input - Request URL or Request object
 * @param {ApiFetchOptions} [init] - Fetch options with auth configuration
 * @param {boolean} [init.auth=true] - Whether to attach auth token (default: true)
 * @param {boolean} [init.autoRetryOn401=true] - Whether to retry on 401 (default: true)
 * @returns {Promise<Response>} Fetch response
 * 
 * @example
 * ```typescript
 * // With authentication (default)
 * const response = await apiFetch('/api/posts');
 * 
 * // Without authentication
 * const response = await apiFetch('/api/public', { auth: false });
 * 
 * // Custom headers
 * const response = await apiFetch('/api/data', {
 *   headers: { 'Custom-Header': 'value' }
 * });
 * ```
 */
export async function apiFetch(input: RequestInfo, init: ApiFetchOptions = {}) {
  const { auth = true, autoRetryOn401 = true, headers, ...rest } = init;
  const finalHeaders = new Headers(headers ?? {});

  if (auth) {
    // Always try to get a fresh token first, fallback to cached token
    const token = await getPrivyAccessToken();

    if (token) {
      finalHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  let response = await fetch(input, {
    ...rest,
    headers: finalHeaders,
  });

  // If we get a 401 and auto-retry is enabled, try to refresh the token and retry
  if (response.status === 401 && auth && autoRetryOn401) {
    const freshToken = await getPrivyAccessToken();
    
    if (freshToken) {
      const retryHeaders = new Headers(headers ?? {});
      retryHeaders.set('Authorization', `Bearer ${freshToken}`);
      
      response = await fetch(input, {
        ...rest,
        headers: retryHeaders,
      });
    }
  }

  return response;
}
