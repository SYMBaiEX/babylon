/** URLSearchParams already decodes the value; never decode it a second time. */
export function safeReturnTo(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  // Browsers normalize backslashes and remove control characters in URLs.
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  const origin = 'https://callback.invalid';
  const destination = new URL(value, origin);
  if (destination.origin !== origin) return '/';
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
