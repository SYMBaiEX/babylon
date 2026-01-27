/**
 * Stripe Client-Side Configuration
 *
 * Client-side Stripe SDK instance for browser usage.
 * Uses the publishable key for client-to-Stripe communication.
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Get or create a Stripe client instance
 *
 * Uses lazy loading to avoid importing Stripe.js until needed.
 * Caches the instance for reuse across the application.
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured');
      return Promise.resolve(null);
    }

    stripePromise = loadStripe(publishableKey);
  }

  return stripePromise;
}

/**
 * Check if Stripe is enabled
 *
 * Stripe is enabled when the publishable key is configured.
 * This can be used to conditionally show the Stripe payment option.
 */
export function isStripeEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
