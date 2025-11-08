export interface ApiFetchOptions extends RequestInit {
  /**
   * When true (default), the current Privy access token is attached if available.
   */
  auth?: boolean;
}

/**
 * Lightweight wrapper around fetch that decorates requests with the latest
 * Privy access token stored on window. Centralising this logic avoids
 * sprinkling direct window lookups across the codebase and keeps future
 * Privy integration changes localised.
 */
export async function apiFetch(input: RequestInfo, init: ApiFetchOptions = {}) {
  const { auth = true, headers, ...rest } = init;
  const finalHeaders = new Headers(headers ?? {});

  if (auth) {
    const token =
      typeof window !== 'undefined' ? (window as typeof window & { __privyAccessToken?: string | null }).__privyAccessToken : null;

    if (token) {
      finalHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  return fetch(input, {
    ...rest,
    headers: finalHeaders,
  });
}
