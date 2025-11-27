/**
 * Client-side API Fetch Utility
 *
 * Lightweight wrapper around fetch that decorates requests with authentication.
 * Uses Privy's HTTP-only cookie authentication.
 */

/**
 * API Fetch Options
 *
 * Extended fetch options with authentication and retry configuration.
 */
export interface ApiFetchOptions extends RequestInit {
  /**
   * When true (default), credentials are included to send the privy-token cookie.
   */
  auth?: boolean;
  /**
   * When true (default), automatically retry with a refreshed token if the request fails with 401.
   */
  autoRetryOn401?: boolean;
}

/**
 * Get a fresh Privy access token
 *
 * Retrieves a fresh Privy access token by calling Privy's getAccessToken().
 * Per Privy best practices, this function ALWAYS calls getAccessToken() on-demand
 * which automatically refreshes tokens nearing expiration.
 *
 * @returns Access token or null if unavailable
 */
export async function getPrivyAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // ALWAYS call getAccessToken() on-demand - it auto-refreshes expired tokens
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
 * Uses Privy's HTTP-only cookie authentication. The `privy-token` cookie is
 * automatically sent by the browser when `credentials: 'include'` is set.
 *
 * On 401 errors, triggers a token refresh via `getAccessToken()` which updates the
 * cookie, then retries the request.
 *
 * @param input - Request URL or Request object
 * @param init - Fetch options with auth configuration
 * @returns Fetch response
 *
 * @example
 * ```typescript
 * // With authentication (default) - cookie sent automatically
 * const response = await apiFetch('/api/posts');
 *
 * // Without authentication
 * const response = await apiFetch('/api/public', { auth: false });
 * ```
 */
export async function apiFetch(
  input: RequestInfo,
  init: ApiFetchOptions = {}
): Promise<Response> {
  const { auth = true, autoRetryOn401 = true, headers, ...rest } = init;
  const finalHeaders = new Headers(headers ?? {});

  // With HTTP-only cookies enabled, authentication is handled via the privy-token cookie
  // which is automatically sent when credentials: 'include' is set.

  let response = await fetch(input, {
    ...rest,
    headers: finalHeaders,
    credentials: auth ? 'include' : (rest.credentials ?? 'same-origin'),
  });

  // If we get a 401 and auto-retry is enabled, refresh the token and retry
  // getAccessToken() updates the privy-token cookie automatically
  if (response.status === 401 && auth && autoRetryOn401) {
    // Trigger token refresh - this updates the cookie
    await getPrivyAccessToken();

    // Retry with the refreshed cookie
    response = await fetch(input, {
      ...rest,
      headers: finalHeaders,
      credentials: 'include',
    });
  }

  return response;
}

