/**
 * Stripe Server-Side Configuration
 *
 * Server-side Stripe SDK instance for API routes.
 * Uses the secret key for server-to-server communication.
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

/**
 * Server-side Stripe instance
 *
 * Used in API routes for:
 * - Creating Checkout Sessions
 * - Verifying webhook signatures
 * - Retrieving payment information
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
});

/**
 * Points pricing configuration
 *
 * 100 points = $1 USD
 * Minimum: $1 (100 points)
 * Maximum: $1000 (100,000 points)
 */
export const POINTS_CONFIG = {
  POINTS_PER_DOLLAR: 100,
  MIN_AMOUNT_USD: 1,
  MAX_AMOUNT_USD: 1000,
  CURRENCY: 'usd',
} as const;

/**
 * Calculate points from USD amount
 */
export function calculatePointsFromUSD(amountUSD: number): number {
  return Math.floor(amountUSD * POINTS_CONFIG.POINTS_PER_DOLLAR);
}

/**
 * Validate purchase amount is within allowed range
 */
export function validatePurchaseAmount(amountUSD: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isFinite(amountUSD) || amountUSD < POINTS_CONFIG.MIN_AMOUNT_USD) {
    return {
      valid: false,
      error: `Minimum purchase amount is $${POINTS_CONFIG.MIN_AMOUNT_USD}`,
    };
  }

  if (amountUSD > POINTS_CONFIG.MAX_AMOUNT_USD) {
    return {
      valid: false,
      error: `Maximum purchase amount is $${POINTS_CONFIG.MAX_AMOUNT_USD}`,
    };
  }

  return { valid: true };
}

/**
 * Get the base URL for redirects based on environment
 *
 * Priority:
 * 1. Explicit override via STRIPE_REDIRECT_BASE_URL (for local dev)
 * 2. Request origin header (passed from API route)
 * 3. NEXT_PUBLIC_APP_URL
 * 4. VERCEL_URL
 * 5. Fallback to localhost
 */
export function getBaseUrl(requestOrigin?: string): string {
  // Allow explicit override for local development
  if (process.env.STRIPE_REDIRECT_BASE_URL) {
    return process.env.STRIPE_REDIRECT_BASE_URL;
  }

  // Use request origin if provided (most accurate for current request)
  if (requestOrigin) {
    return requestOrigin;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

/**
 * Verify Stripe webhook signature
 *
 * @throws Error if signature is invalid
 */
export function constructWebhookEvent(
  payload: string,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}
