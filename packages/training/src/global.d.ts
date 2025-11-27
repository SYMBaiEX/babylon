/**
 * Global Type Declarations for Training Package
 *
 * Extends types for cross-package type checking
 */

declare global {
  interface Window {
    /**
     * Privy access token getter - injected by Privy Provider
     * Returns a fresh access token, automatically refreshing if needed
     */
    __privyGetAccessToken?: () => Promise<string | null>;
  }
}

export {};
