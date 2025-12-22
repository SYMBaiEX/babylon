/**
 * Admin Authorization Utilities
 *
 * @description Server-side utilities for checking admin privileges.
 * Uses environment variable ADMIN_EMAIL_DOMAIN to automatically grant
 * admin privileges to users with emails from the specified domain.
 */

/**
 * Get the admin email domain from environment variable.
 * Returns null if not configured.
 *
 * @example
 * // ADMIN_EMAIL_DOMAIN=elizalabs.ai in .env
 * getAdminEmailDomain() // Returns 'elizalabs.ai'
 */
export function getAdminEmailDomain(): string | null {
  const domain = process.env.ADMIN_EMAIL_DOMAIN;
  return domain?.trim() || null;
}

/**
 * Check if an email address should be auto-granted admin privileges.
 *
 * @param email - The email address to check
 * @returns True if the email domain matches the admin domain
 *
 * @example
 * // ADMIN_EMAIL_DOMAIN=elizalabs.ai
 * isAdminEmail('user@elizalabs.ai') // true
 * isAdminEmail('user@gmail.com') // false
 * isAdminEmail(null) // false
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const adminDomain = getAdminEmailDomain();
  if (!adminDomain) return false;

  const emailLower = email.toLowerCase().trim();
  const domainLower = adminDomain.toLowerCase().trim();

  // Check if email ends with @domain
  return emailLower.endsWith(`@${domainLower}`);
}
