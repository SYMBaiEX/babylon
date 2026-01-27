/**
 * Stripe Webhook Handler
 *
 * @route POST /api/stripe/webhook - Handle Stripe webhook events
 * @access Public (signature-verified)
 *
 * @description
 * Receives and processes Stripe webhook events for payment lifecycle.
 * Critically handles checkout.session.completed to credit points.
 *
 * Security:
 * - Webhook signature is verified before processing
 * - Idempotency is ensured via paymentRequestId uniqueness
 * - No authentication required (signature verification is auth)
 *
 * @openapi
 * /api/stripe/webhook:
 *   post:
 *     tags:
 *       - Stripe
 *     summary: Handle Stripe webhook events
 *     description: Receives Stripe webhook events (signature-verified)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid signature or malformed event
 *
 * Handled Events:
 * - checkout.session.completed: Credit points to user
 * - checkout.session.expired: Log expiration (no action needed)
 * - checkout.session.async_payment_succeeded: Credit points (async methods)
 * - checkout.session.async_payment_failed: Log failure
 * - charge.dispute.created: Deduct points (Phase 2)
 * - charge.refunded: Deduct points (Phase 2)
 */

import { PointsService } from '@babylon/api';
import { and, db, eq, pointsTransactions } from '@babylon/db';
import { logger } from '@babylon/shared';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { trackServerEvent } from '@/lib/posthog/server';
import { constructWebhookEvent, stripe } from '@/lib/stripe/server';

/**
 * Stripe webhook requires raw body for signature verification.
 * Next.js App Router provides request body as a stream.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    logger.error(
      'Stripe webhook received without signature',
      {},
      'StripeWebhook'
    );
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  // Verify webhook signature
  try {
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(
      'Stripe webhook signature verification failed',
      { error: message },
      'StripeWebhook'
    );
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  logger.info(
    `Stripe webhook received: ${event.type}`,
    { eventId: event.id, type: event.type },
    'StripeWebhook'
  );

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object, event.id);
      break;

    case 'checkout.session.async_payment_succeeded':
      // Same handling as completed - async payment methods (bank debits, etc.)
      await handleCheckoutSessionCompleted(event.data.object, event.id);
      break;

    case 'checkout.session.expired':
      await handleCheckoutSessionExpired(event.data.object);
      break;

    case 'checkout.session.async_payment_failed':
      await handleCheckoutSessionFailed(event.data.object);
      break;

    case 'charge.dispute.created':
      await handleDisputeCreated(event.data.object as Stripe.Dispute, event.id);
      break;

    case 'charge.dispute.closed':
      await handleDisputeClosed(event.data.object as Stripe.Dispute, event.id);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge, event.id);
      break;

    default:
      logger.info(
        `Unhandled Stripe event type: ${event.type}`,
        { eventId: event.id },
        'StripeWebhook'
      );
  }

  // Always return 200 to acknowledge receipt
  // Even if processing fails, we don't want Stripe to retry indefinitely
  return NextResponse.json({ received: true });
}

/**
 * Handle successful checkout session completion
 *
 * This is the critical path for crediting points after payment.
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  // Retrieve the full session to ensure we have all metadata
  // Webhook events may not include all fields
  let fullSession = session;
  if (!session.metadata || Object.keys(session.metadata).length === 0) {
    logger.info(
      'Retrieving full session from Stripe API',
      { sessionId: session.id },
      'StripeWebhook'
    );
    fullSession = await stripe.checkout.sessions.retrieve(session.id);
  }

  const metadata = fullSession.metadata;

  logger.info(
    'Processing checkout.session.completed',
    {
      sessionId: session.id,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : [],
      metadata,
    },
    'StripeWebhook'
  );

  if (!metadata || Object.keys(metadata).length === 0) {
    logger.error(
      'Checkout session completed without metadata',
      { sessionId: session.id },
      'StripeWebhook'
    );
    return;
  }

  const { userId, pointsAmount, amountUSD, purchaseType } = metadata;

  // Validate this is a points purchase
  if (purchaseType !== 'points') {
    logger.info(
      'Checkout session is not a points purchase, skipping',
      { sessionId: session.id, purchaseType },
      'StripeWebhook'
    );
    return;
  }

  if (!userId || !pointsAmount || !amountUSD) {
    logger.error(
      'Checkout session metadata missing required fields',
      { sessionId: session.id, metadata },
      'StripeWebhook'
    );
    return;
  }

  // Extract payment intent ID for tracking
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

  logger.info(
    `Processing points purchase from Stripe checkout`,
    {
      sessionId: session.id,
      userId,
      pointsAmount,
      amountUSD,
      paymentIntentId,
      eventId,
    },
    'StripeWebhook'
  );

  // Credit points to user
  // Uses session.id as paymentRequestId for idempotency
  // The PointsService will reject if this session ID was already processed
  let result;
  try {
    logger.info(
      'Calling PointsService.purchasePoints',
      {
        userId,
        amountUSD: parseFloat(amountUSD),
        sessionId: fullSession.id,
        paymentIntentId,
      },
      'StripeWebhook'
    );

    result = await PointsService.purchasePoints(
      userId,
      parseFloat(amountUSD),
      fullSession.id, // paymentRequestId - unique, ensures idempotency
      paymentIntentId, // paymentTxHash - Stripe payment intent ID
      'stripe' // paymentProvider
    );

    logger.info(
      'PointsService.purchasePoints result',
      { result },
      'StripeWebhook'
    );
  } catch (err) {
    logger.error(
      'Exception calling PointsService.purchasePoints',
      {
        sessionId: fullSession.id,
        userId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      'StripeWebhook'
    );
    return;
  }

  if (!result.success) {
    // Check if this is a duplicate (already processed)
    if (result.error?.includes('duplicate') || result.alreadyAwarded) {
      logger.info(
        'Points purchase already processed (idempotency check passed)',
        { sessionId: fullSession.id, userId },
        'StripeWebhook'
      );
      return;
    }

    logger.error(
      'Failed to credit points after Stripe checkout',
      {
        sessionId: fullSession.id,
        userId,
        error: result.error,
      },
      'StripeWebhook'
    );
    return;
  }

  logger.info(
    `Successfully credited ${result.pointsAwarded} points from Stripe purchase`,
    {
      sessionId: fullSession.id,
      userId,
      pointsAwarded: result.pointsAwarded,
      newTotal: result.newTotal,
      amountUSD,
    },
    'StripeWebhook'
  );

  trackServerEvent(userId, 'stripe_checkout_completed', {
    amountUSD: parseFloat(amountUSD),
    pointsAwarded: result.pointsAwarded,
    newTotal: result.newTotal,
    sessionId: fullSession.id,
    ...(paymentIntentId ? { paymentIntentId } : {}),
  });
}

/**
 * Handle expired checkout session
 *
 * Session expired without payment. Just log for monitoring.
 */
async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = session.metadata;
  const userId = metadata?.userId;

  logger.info(
    'Stripe checkout session expired',
    {
      sessionId: session.id,
      userId: userId || 'unknown',
      amountUSD: metadata?.amountUSD,
    },
    'StripeWebhook'
  );

  if (userId) {
    trackServerEvent(userId, 'stripe_checkout_expired', {
      sessionId: session.id,
      ...(metadata?.amountUSD
        ? { amountUSD: parseFloat(metadata.amountUSD) }
        : {}),
    });
  }
}

/**
 * Handle failed async payment
 *
 * Async payment method (bank debit, etc.) failed after initial authorization.
 */
async function handleCheckoutSessionFailed(
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = session.metadata;
  const userId = metadata?.userId;

  logger.warn(
    'Stripe checkout async payment failed',
    {
      sessionId: session.id,
      userId: userId || 'unknown',
      amountUSD: metadata?.amountUSD,
    },
    'StripeWebhook'
  );

  if (userId) {
    trackServerEvent(userId, 'stripe_checkout_failed', {
      sessionId: session.id,
      ...(metadata?.amountUSD
        ? { amountUSD: parseFloat(metadata.amountUSD) }
        : {}),
    });
  }
}

/**
 * Handle dispute (chargeback) creation
 *
 * User initiated a chargeback. Deduct points from user's trading balance.
 * This protects against fraud where users buy points and then chargeback.
 */
async function handleDisputeCreated(
  dispute: Stripe.Dispute,
  eventId: string
): Promise<void> {
  // Get the charge to find the original payment
  const chargeId =
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  if (!chargeId) {
    logger.error(
      'Dispute created without charge ID',
      { disputeId: dispute.id },
      'StripeWebhook'
    );
    return;
  }

  // Retrieve the charge to get payment intent
  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['payment_intent'],
  });

  const paymentIntent = charge.payment_intent as Stripe.PaymentIntent | null;
  const paymentIntentId = paymentIntent?.id;

  if (!paymentIntentId) {
    logger.error(
      'Dispute charge has no payment intent',
      { disputeId: dispute.id, chargeId },
      'StripeWebhook'
    );
    return;
  }

  // Find the original transaction to get the userId
  const originalTxResult = await db
    .select({
      userId: pointsTransactions.userId,
      amount: pointsTransactions.amount,
      paymentAmount: pointsTransactions.paymentAmount,
    })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.paymentTxHash, paymentIntentId),
        eq(pointsTransactions.reason, 'purchase')
      )
    )
    .limit(1);

  const originalTx = originalTxResult[0];

  if (!originalTx) {
    logger.warn(
      'No original purchase transaction found for disputed payment',
      { disputeId: dispute.id, paymentIntentId },
      'StripeWebhook'
    );
    return;
  }

  const amountUSD = dispute.amount / 100; // Stripe uses cents

  logger.warn(
    'Processing dispute (chargeback) - deducting points',
    {
      disputeId: dispute.id,
      chargeId,
      userId: originalTx.userId,
      amountUSD,
      reason: dispute.reason,
      status: dispute.status,
      paymentIntentId,
    },
    'StripeWebhook'
  );

  // Deduct points from user
  const result = await PointsService.reversePointsPurchase(
    originalTx.userId,
    paymentIntentId,
    'dispute',
    amountUSD,
    eventId
  );

  if (result.success) {
    logger.info(
      `Deducted ${Math.abs(result.pointsAwarded)} points from user due to dispute`,
      {
        disputeId: dispute.id,
        userId: originalTx.userId,
        pointsDeducted: Math.abs(result.pointsAwarded),
        newBalance: result.newTotal,
      },
      'StripeWebhook'
    );

    trackServerEvent(originalTx.userId, 'stripe_dispute_points_deducted', {
      disputeId: dispute.id,
      amountUSD,
      pointsDeducted: Math.abs(result.pointsAwarded),
      reason: dispute.reason,
    });
  } else {
    logger.error(
      'Failed to deduct points for dispute',
      {
        disputeId: dispute.id,
        userId: originalTx.userId,
        error: result.error,
      },
      'StripeWebhook'
    );
  }
}

/**
 * Handle dispute closed
 *
 * Dispute has been resolved (won, lost, or withdrawn).
 * If merchant won the dispute, re-credit the points that were deducted.
 */
async function handleDisputeClosed(
  dispute: Stripe.Dispute,
  eventId: string
): Promise<void> {
  // Determine outcome
  const merchantWon = dispute.status === 'won';

  logger.info(
    `Stripe dispute closed: ${merchantWon ? 'MERCHANT WON' : 'CUSTOMER WON'}`,
    {
      disputeId: dispute.id,
      status: dispute.status,
    },
    'StripeWebhook'
  );

  // Only take action if merchant won - re-credit the points
  if (!merchantWon) {
    // Customer won or dispute was lost - points stay deducted
    return;
  }

  // Get the charge to find the original payment
  const chargeId =
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  if (!chargeId) {
    logger.error(
      'Dispute closed without charge ID',
      { disputeId: dispute.id },
      'StripeWebhook'
    );
    return;
  }

  // Retrieve the charge to get payment intent
  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['payment_intent'],
  });

  const paymentIntent = charge.payment_intent as Stripe.PaymentIntent | null;
  const paymentIntentId = paymentIntent?.id;

  if (!paymentIntentId) {
    logger.error(
      'Dispute charge has no payment intent',
      { disputeId: dispute.id, chargeId },
      'StripeWebhook'
    );
    return;
  }

  // Find the dispute deduction transaction to get the userId
  const deductionTxResult = await db
    .select({
      userId: pointsTransactions.userId,
      amount: pointsTransactions.amount,
      paymentAmount: pointsTransactions.paymentAmount,
    })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.paymentTxHash, paymentIntentId),
        eq(pointsTransactions.reason, 'purchase_dispute')
      )
    )
    .limit(1);

  const deductionTx = deductionTxResult[0];

  if (!deductionTx) {
    logger.warn(
      'No dispute deduction transaction found for won dispute',
      { disputeId: dispute.id, paymentIntentId },
      'StripeWebhook'
    );
    return;
  }

  const amountUSD = dispute.amount / 100; // Stripe uses cents

  logger.info(
    'Re-crediting points after winning dispute',
    {
      disputeId: dispute.id,
      userId: deductionTx.userId,
      amountUSD,
    },
    'StripeWebhook'
  );

  // Re-credit points to user
  const result = await PointsService.creditDisputeWon(
    deductionTx.userId,
    dispute.id,
    amountUSD,
    eventId
  );

  if (result.success) {
    logger.info(
      `Re-credited ${result.pointsAwarded} points to user after winning dispute`,
      {
        disputeId: dispute.id,
        userId: deductionTx.userId,
        pointsCredited: result.pointsAwarded,
        newBalance: result.newTotal,
      },
      'StripeWebhook'
    );

    trackServerEvent(deductionTx.userId, 'stripe_dispute_won_points_credited', {
      disputeId: dispute.id,
      amountUSD,
      pointsCredited: result.pointsAwarded,
    });
  } else {
    logger.error(
      'Failed to re-credit points after dispute won',
      {
        disputeId: dispute.id,
        userId: deductionTx.userId,
        error: result.error,
      },
      'StripeWebhook'
    );
  }
}

/**
 * Handle charge refund
 *
 * A refund was processed. Deduct the corresponding points from user's balance.
 * Handles both full and partial refunds.
 */
async function handleChargeRefunded(
  charge: Stripe.Charge,
  eventId: string
): Promise<void> {
  const refundedAmountCents = charge.amount_refunded;
  const refundedAmountUSD = refundedAmountCents / 100;
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    logger.error(
      'Refund charge has no payment intent',
      { chargeId: charge.id },
      'StripeWebhook'
    );
    return;
  }

  // Find the original transaction to get the userId
  const originalTxResult = await db
    .select({
      userId: pointsTransactions.userId,
      amount: pointsTransactions.amount,
      paymentAmount: pointsTransactions.paymentAmount,
    })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.paymentTxHash, paymentIntentId),
        eq(pointsTransactions.reason, 'purchase')
      )
    )
    .limit(1);

  const originalTx = originalTxResult[0];

  if (!originalTx) {
    logger.warn(
      'No original purchase transaction found for refunded charge',
      { chargeId: charge.id, paymentIntentId },
      'StripeWebhook'
    );
    return;
  }

  logger.info(
    'Processing refund - deducting points',
    {
      chargeId: charge.id,
      userId: originalTx.userId,
      refundedAmountUSD,
      fullRefund: charge.refunded,
      paymentIntentId,
    },
    'StripeWebhook'
  );

  // Deduct points from user
  const result = await PointsService.reversePointsPurchase(
    originalTx.userId,
    paymentIntentId,
    'refund',
    refundedAmountUSD,
    eventId
  );

  if (result.success) {
    if (result.alreadyAwarded) {
      logger.info(
        'Refund already processed (idempotency check passed)',
        { chargeId: charge.id, eventId },
        'StripeWebhook'
      );
      return;
    }

    logger.info(
      `Deducted ${Math.abs(result.pointsAwarded)} points from user due to refund`,
      {
        chargeId: charge.id,
        userId: originalTx.userId,
        pointsDeducted: Math.abs(result.pointsAwarded),
        newBalance: result.newTotal,
        fullRefund: charge.refunded,
      },
      'StripeWebhook'
    );

    trackServerEvent(originalTx.userId, 'stripe_refund_points_deducted', {
      chargeId: charge.id,
      amountUSD: refundedAmountUSD,
      pointsDeducted: Math.abs(result.pointsAwarded),
      fullRefund: charge.refunded,
    });
  } else {
    logger.error(
      'Failed to deduct points for refund',
      {
        chargeId: charge.id,
        userId: originalTx.userId,
        error: result.error,
      },
      'StripeWebhook'
    );
  }
}
