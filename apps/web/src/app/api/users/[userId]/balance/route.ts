/**
 * User Balance API
 *
 * @route GET /api/users/[userId]/balance - Get user balance
 * @access Authenticated (own balance only)
 *
 * @description
 * Retrieves authenticated user's balance information including virtual balance,
 * total deposited, total withdrawn, and lifetime P&L. Uses caching for performance.
 * Users can only view their own balance.
 *
 * @openapi
 * /api/users/{userId}/balance:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get user balance
 *     description: Returns user's balance information (own balance only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (must match authenticated user)
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: string
 *                   description: Current virtual balance
 *                 totalDeposited:
 *                   type: string
 *                   description: Total amount deposited
 *                 totalWithdrawn:
 *                   type: string
 *                   description: Total amount withdrawn
 *                 lifetimePnL:
 *                   type: string
 *                   description: Lifetime profit/loss
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Cannot view another user's balance
 *       404:
 *         description: Balance not found
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/users/user_123/balance', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * const { balance, lifetimePnL } = await response.json();
 * ```
 *
 * @see {@link /lib/cached-database-service} Cached database service
 */

import type { NextRequest } from 'next/server';
import { db, users } from '@babylon/db';
import { optionalAuth } from '@babylon/api';
import { cachedDb } from '@babylon/api';
import { AuthorizationError, BusinessLogicError } from '@babylon/api';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { findUserByIdentifier } from '@babylon/api';
import { convertBalanceToStrings } from '@babylon/shared';
import { UserIdParamSchema } from '@babylon/shared';

/**
 * GET Handler for User Balance
 *
 * @description Retrieves authenticated user's balance information with caching for performance
 *
 * @param {NextRequest} request - Next.js request object
 * @param {Object} context - Route context containing dynamic parameters
 * @param {Promise<{userId: string}>} context.params - Dynamic route parameters
 *
 * @returns {Promise<NextResponse>} User balance data
 *
 * @throws {AuthorizationError} When user tries to view another user's balance
 * @throws {BusinessLogicError} When balance data not found
 * @throws {ValidationError} When userId parameter is invalid
 *
 * @example
 * ```typescript
 * // Request (with auth header)
 * GET /api/users/user_123/balance
 * Authorization: Bearer <token>
 *
 * // Response
 * {
 *   "balance": "10000.50",
 *   "totalDeposited": "15000.00",
 *   "totalWithdrawn": "5000.00",
 *   "lifetimePnL": "500.50"
 * }
 * ```
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    const { userId } = UserIdParamSchema.parse(await context.params);

    // Optional authentication - check if user is requesting their own balance
    const authUser = await optionalAuth(request);

    // Ensure user exists in database
    let dbUser = await findUserByIdentifier(userId, {
      id: true,
    });

    if (!dbUser) {
      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          privyId: userId,
          isActor: false,
          updatedAt: new Date(),
        })
        .returning();
      if (!newUser) {
        throw new Error('Failed to create user');
      }
      dbUser = newUser;
    }

    const canonicalUserId = dbUser!.id;

    // If authenticated, ensure they're requesting their own balance
    if (authUser && authUser.userId !== canonicalUserId) {
      throw new AuthorizationError(
        'Can only view your own balance',
        'balance',
        'read'
      );
    }

    // Get balance info with caching
    const balanceData = await cachedDb.getUserBalance(canonicalUserId);

    if (!balanceData) {
      throw new BusinessLogicError(
        'User balance not found',
        'BALANCE_NOT_FOUND'
      );
    }

    // Safely convert balance fields to strings
    // When data comes from cache, Decimal objects may be serialized as strings or numbers
    const balanceInfo = convertBalanceToStrings({
      virtualBalance: balanceData.virtualBalance,
      totalDeposited: balanceData.totalDeposited,
      totalWithdrawn: balanceData.totalWithdrawn,
      lifetimePnL: balanceData.lifetimePnL,
    });

    logger.info(
      'Balance fetched successfully (cached)',
      { userId: canonicalUserId, balance: balanceInfo.virtualBalance },
      'GET /api/users/[userId]/balance'
    );

    return successResponse({
      balance: balanceInfo.virtualBalance,
      totalDeposited: balanceInfo.totalDeposited,
      totalWithdrawn: balanceInfo.totalWithdrawn,
      lifetimePnL: balanceInfo.lifetimePnL,
    });
  }
);
