/**
 * Stripe Checkout Session API
 *
 * @route POST /api/stripe/checkout/session - Create Stripe Checkout Session
 * @access Authenticated
 *
 * @description
 * Creates a Stripe Checkout Session for purchasing points with a credit card.
 * Returns the session URL for redirecting the user to Stripe's hosted checkout.
 *
 * Points are credited via webhook after successful payment, not in this endpoint.
 *
 * @openapi
 * /api/stripe/checkout/session:
 *   post:
 *     tags:
 *       - Stripe
 *       - Points
 *     summary: Create Stripe Checkout Session for points purchase
 *     description: Creates a Stripe Checkout Session and returns the URL for redirect
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amountUSD
 *             properties:
 *               amountUSD:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 1000
 *                 description: Amount in USD (1-1000)
 *     responses:
 *       200:
 *         description: Checkout session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessionId:
 *                   type: string
 *                   description: Stripe Checkout Session ID
 *                 url:
 *                   type: string
 *                   description: URL to redirect user to Stripe Checkout
 *       400:
 *         description: Invalid input (amount out of range)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Stripe API error
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/stripe/checkout/session', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Authorization': `Bearer ${token}`
 *   },
 *   body: JSON.stringify({ amountUSD: 50 })
 * });
 *
 * const { url } = await response.json();
 * window.location.href = url; // Redirect to Stripe Checkout
 * ```
 */

import { authenticate } from '@babylon/api';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { trackServerEvent } from '@/lib/posthog/server';
import {
  calculatePointsFromUSD,
  getBaseUrl,
  POINTS_CONFIG,
  stripe,
  validatePurchaseAmount,
} from '@/lib/stripe/server';

interface CreateCheckoutSessionBody {
  amountUSD: number;
}

export async function POST(req: NextRequest) {
  const authUser = await authenticate(req);
  const userId = authUser.dbUserId!;
  const userEmail = authUser.email;

  const body: CreateCheckoutSessionBody = await req.json();
  const { amountUSD } = body;

  // Validate amount
  const validation = validatePurchaseAmount(amountUSD);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400 }
    );
  }

  const pointsAmount = calculatePointsFromUSD(amountUSD);

  // Get the origin from the request for accurate redirect URLs
  const requestOrigin =
    req.headers.get('origin') ||
    req.headers.get('referer')?.replace(/\/[^/]*$/, '');
  const baseUrl = getBaseUrl(requestOrigin || undefined);

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: POINTS_CONFIG.CURRENCY,
          unit_amount: amountUSD * 100, // Stripe uses cents
          product_data: {
            name: `${pointsAmount.toLocaleString()} Babylon Points`,
            description: `Purchase ${pointsAmount.toLocaleString()} points for $${amountUSD}`,
          },
        },
        quantity: 1,
      },
    ],
    // Store purchase details in metadata for webhook processing
    metadata: {
      userId,
      pointsAmount: pointsAmount.toString(),
      amountUSD: amountUSD.toString(),
      purchaseType: 'points',
    },
    // Pre-fill customer email if available
    customer_email: userEmail || undefined,
    // Success redirect includes session ID for confirmation display
    success_url: `${baseUrl}/markets?stripe_success=true&session_id={CHECKOUT_SESSION_ID}`,
    // Cancel redirect for user who abandons checkout
    cancel_url: `${baseUrl}/markets?stripe_cancelled=true`,
    // Session expires after 30 minutes
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  logger.info(
    `Created Stripe checkout session for ${pointsAmount} points ($${amountUSD})`,
    {
      userId,
      sessionId: session.id,
      amountUSD,
      pointsAmount,
    },
    'StripeCheckout'
  );

  trackServerEvent(userId, 'stripe_checkout_initiated', {
    amountUSD,
    pointsAmount,
    sessionId: session.id,
  });

  return NextResponse.json({
    success: true,
    sessionId: session.id,
    url: session.url,
  });
}
