/**
 * Privy Email Utility Functions
 *
 * @description Shared utilities for extracting and processing email addresses
 * from Privy user objects. Used for admin email domain checks and other
 * email-related functionality.
 *
 * These utilities work with both primary email (user.email) and linked email
 * accounts (user.linkedAccounts) to ensure complete email coverage.
 */

/**
 * Minimal Privy user type for email extraction.
 * Compatible with both server SDK User type and client-side user objects.
 */
export interface PrivyUserWithEmails {
  email?: { address?: string };
  linkedAccounts?: Array<{
    type?: string;
    address?: string;
  }>;
}

/**
 * Get all verified email addresses from a Privy user.
 *
 * Checks both the primary email (`user.email?.address`) and the `linkedAccounts`
 * array for email-type accounts. This ensures we catch emails that were linked
 * after initial signup (e.g., user logged in with Farcaster first, then linked
 * their company email later).
 *
 * @param user - The Privy user object (or null/undefined)
 * @returns Array of all verified email addresses (deduplicated, lowercase)
 *
 * @example
 * const emails = getAllVerifiedEmails(privyUser);
 * // Returns: ['user@gmail.com', 'user@company.com']
 *
 * @example
 * // User logged in with Farcaster, later linked email
 * const emails = getAllVerifiedEmails(privyUser);
 * // Returns email from linkedAccounts even if user.email is undefined
 */
export function getAllVerifiedEmails(
  user: PrivyUserWithEmails | null | undefined
): string[] {
  if (!user) return [];

  const emails: string[] = [];

  // Check primary email field (convenience property)
  if (user.email?.address) {
    emails.push(user.email.address.toLowerCase());
  }

  // Check linkedAccounts for additional email-type accounts
  if (Array.isArray(user.linkedAccounts)) {
    for (const account of user.linkedAccounts) {
      if (account?.type === 'email' && account.address) {
        const normalizedEmail = account.address.toLowerCase();
        // Avoid duplicates (primary email may also be in linkedAccounts)
        if (!emails.includes(normalizedEmail)) {
          emails.push(normalizedEmail);
        }
      }
    }
  }

  return emails;
}

/**
 * Find an email matching the admin domain from a list of verified emails.
 *
 * @param emails - Array of verified email addresses
 * @param adminDomain - The admin domain to match (e.g., 'elizalabs.ai')
 * @returns The first matching admin email, or null if none match
 *
 * @example
 * const adminEmail = findEmailByDomain(['user@gmail.com', 'user@elizalabs.ai'], 'elizalabs.ai');
 * // Returns: 'user@elizalabs.ai'
 *
 * @example
 * const adminEmail = findEmailByDomain([], 'elizalabs.ai');
 * // Returns: null (empty array)
 */
export function findEmailByDomain(
  emails: string[],
  adminDomain: string | null | undefined
): string | null {
  if (!adminDomain || emails.length === 0) return null;

  const domainLower = `@${adminDomain.toLowerCase().trim()}`;

  for (const email of emails) {
    if (email.toLowerCase().endsWith(domainLower)) {
      return email;
    }
  }

  return null;
}

/**
 * Check if any of the user's verified emails matches the admin domain.
 *
 * Convenience function that combines getAllVerifiedEmails and findEmailByDomain.
 * Uses ADMIN_EMAIL_DOMAIN environment variable.
 *
 * @param user - The Privy user object
 * @returns Object with adminEmail (if found) and allEmails array
 *
 * @example
 * const { adminEmail, allEmails } = checkForAdminEmail(privyUser);
 * if (adminEmail) {
 *   // User has admin access
 * }
 */
export function checkForAdminEmail(
  user: PrivyUserWithEmails | null | undefined
): { adminEmail: string | null; allVerifiedEmails: string[] } {
  const adminDomain = process.env.ADMIN_EMAIL_DOMAIN?.trim() ?? null;
  const allVerifiedEmails = getAllVerifiedEmails(user);
  const adminEmail = findEmailByDomain(allVerifiedEmails, adminDomain);

  return { adminEmail, allVerifiedEmails };
}
