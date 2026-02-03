/**
 * User Points History API
 *
 * @route GET /api/users/[userId]/points-history - Get user's points transaction history
 * @access Authenticated
 *
 * @description
 * Returns the user's points transactions history (limited to recent transactions).
 * Includes both:
 * - Reputation points from pointsTransactions (bonuses, referrals, etc.)
 * - Trading balance purchases from balanceTransactions (Stripe/crypto purchases)
 *
 * Used by BillingTab to show purchase history and by other components to check claimed rewards.
 */

import {
  AuthorizationError,
  authenticate,
  requireUserByIdentifier,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  balanceTransactions,
  db,
  desc,
  eq,
  pointsTransactions,
} from '@babylon/db';
import { UserIdParamSchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';

// Map balanceTransactions types to legacy pointsTransactions reasons for API compatibility
const BALANCE_TYPE_TO_REASON: Record<string, string> = {
  stripe_purchase: 'purchase',
  crypto_purchase: 'purchase',
  stripe_refund: 'purchase_refund',
  stripe_dispute: 'purchase_dispute',
  stripe_dispute_won: 'purchase_dispute_won',
};

/**
 * GET /api/users/[userId]/points-history
 * Get user's points transaction history
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    // Authenticate user
    const authUser = await authenticate(request);
    const { userId } = UserIdParamSchema.parse(await context.params);

    // Check if the authenticated user has a database record
    if (!authUser.dbUserId) {
      throw new AuthorizationError(
        'User profile not found. Please complete onboarding first.',
        'points-history',
        'read'
      );
    }

    const targetUser = await requireUserByIdentifier(userId, { id: true });
    const canonicalUserId = targetUser.id;

    // Verify user is getting their own history
    if (authUser.dbUserId !== canonicalUserId) {
      throw new AuthorizationError(
        'You can only view your own points history',
        'points-history',
        'read'
      );
    }

    // Get reputation points transactions (bonuses, referrals, etc.)
    const reputationTransactions = await db
      .select()
      .from(pointsTransactions)
      .where(eq(pointsTransactions.userId, canonicalUserId))
      .orderBy(desc(pointsTransactions.createdAt))
      .limit(100);

    // Get purchase-related balance transactions (Stripe/crypto purchases)
    const purchaseTypes = Object.keys(BALANCE_TYPE_TO_REASON);
    const purchaseTransactionsRaw = await db
      .select()
      .from(balanceTransactions)
      .where(eq(balanceTransactions.userId, canonicalUserId))
      .orderBy(desc(balanceTransactions.createdAt))
      .limit(100);

    // Filter to only purchase-related types and map to legacy format
    const purchaseTransactions = purchaseTransactionsRaw
      .filter((tx) => purchaseTypes.includes(tx.type))
      .map((tx) => {
        // Parse description JSON for additional metadata
        let metadata: Record<string, unknown> = {};
        let paymentProvider: string | null = null;
        let paymentTxHash: string | null = null;
        let paymentRequestId: string | null = null;
        let paymentAmount: string | null = null;

        try {
          if (tx.description) {
            metadata = JSON.parse(tx.description);
            paymentProvider = (metadata.paymentProvider as string) || null;
            paymentTxHash = (metadata.paymentTxHash as string) || null;
            paymentRequestId = (metadata.paymentRequestId as string) || null;
            if (metadata.amountUSD) {
              paymentAmount = String(metadata.amountUSD);
            }
          }
        } catch {
          // Ignore JSON parse errors
        }

        return {
          id: tx.id,
          userId: tx.userId,
          amount: Number(tx.amount),
          pointsBefore: Number(tx.balanceBefore),
          pointsAfter: Number(tx.balanceAfter),
          reason: BALANCE_TYPE_TO_REASON[tx.type] || tx.type,
          metadata: tx.description,
          createdAt: tx.createdAt.toISOString(),
          paymentRequestId: paymentRequestId || tx.relatedId,
          paymentTxHash: paymentTxHash || tx.relatedId,
          paymentAmount,
          paymentVerified: true,
          paymentProvider,
        };
      });

    // Combine and sort by date (most recent first)
    const allTransactions = [
      ...reputationTransactions.map((tx) => ({
        ...tx,
        createdAt: tx.createdAt.toISOString(),
      })),
      ...purchaseTransactions,
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return successResponse({
      transactions: allTransactions.slice(0, 100),
    });
  }
);
