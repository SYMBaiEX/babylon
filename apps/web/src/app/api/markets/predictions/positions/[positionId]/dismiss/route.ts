import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { db, positions } from '@babylon/db';
import { logger, SnowflakeIdSchema } from '@babylon/shared';
import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const ParamsSchema = z.object({
  positionId: SnowflakeIdSchema,
});

/**
 * POST /api/markets/predictions/positions/[positionId]/dismiss
 * 
 * Allows a user to dismiss a "dead" position that can't be sold.
 * This marks the position as resolved and zeroes out shares.
 * 
 * Use cases:
 * - Positions with 0 shares that weren't cleaned up
 * - Positions on corrupt/broken markets
 * - Edge cases where sell fails but user wants to clear the position
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ positionId: string }> }
  ) => {
    const user = await authenticate(request);
    const { positionId } = ParamsSchema.parse(await context.params);

    // Find the position - must belong to the user
    const [position] = await db
      .select()
      .from(positions)
      .where(
        and(eq(positions.id, positionId), eq(positions.userId, user.userId))
      )
      .limit(1);

    if (!position) {
      return successResponse(
        { error: 'Position not found or not owned by user' },
        404
      );
    }

    // Already resolved - nothing to do
    if (position.status === 'resolved') {
      return successResponse({
        success: true,
        message: 'Position already resolved',
        positionId,
      });
    }

    // Mark as resolved with 0 shares (dismiss without payout)
    await db
      .update(positions)
      .set({
        shares: '0',
        status: 'resolved',
        outcome: null, // No outcome - user dismissed
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(positions.id, positionId));

    logger.info(
      'Position dismissed by user',
      {
        positionId,
        userId: user.userId,
        previousShares: position.shares,
      },
      'DismissPosition'
    );

    return successResponse({
      success: true,
      message: 'Position dismissed successfully',
      positionId,
    });
  }
);

