/**
 * NFT Image Proxy Utilities
 *
 * Shared utilities for NFT image handling, extracted for reusability and testability.
 */

/**
 * Validates that a URL is from a trusted GitHub domain.
 * Accepts githubusercontent.com and github.com hostnames.
 *
 * @param url - The URL to validate (accepts unknown for type guard usage)
 * @returns True if the URL is a valid GitHub URL, false otherwise
 *
 * @example
 * ```ts
 * isValidGitHubUrl('https://raw.githubusercontent.com/user/repo/main/image.png') // true
 * isValidGitHubUrl('https://github.com/user/repo') // true
 * isValidGitHubUrl('https://evil.com/malicious') // false
 * isValidGitHubUrl(null) // false
 * ```
 */
export function isValidGitHubUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    // Enforce HTTPS to prevent downgrade attacks
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Only allow exact matches or true subdomains (with leading dot)
    // This prevents malicious domains like "evilgithubusercontent.com"
    const isValidGitHub =
      hostname === 'github.com' || hostname.endsWith('.github.com');
    const isValidGitHubUserContent =
      hostname === 'githubusercontent.com' ||
      hostname.endsWith('.githubusercontent.com');
    return isValidGitHub || isValidGitHubUserContent;
  } catch {
    return false;
  }
}
