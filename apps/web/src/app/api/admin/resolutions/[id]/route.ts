/**
 * Admin Resolution Review Action API
 *
 * @route POST /api/admin/resolutions/[id] - Approve or reject a pending resolution
 * @access Admin
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import { db, eq, questions } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/** Hours to postpone resolution after rejection (default: 24h) */
const POSTPONE_HOURS = Number(process.env.RESOLUTION_POSTPONE_HOURS) || 24;

const ParamsSchema = z.object({
  id: z.string().min(1),
});

const BodySchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const admin = await requireAdmin(request);
    const { id } = ParamsSchema.parse(await context.params);
    const { action } = BodySchema.parse(await request.json());

    const [existing] = await db
      .select({
        id: questions.id,
        questionNumber: questions.questionNumber,
        status: questions.status,
        requiresManualReview: questions.requiresManualReview,
        resolutionReviewStatus: questions.resolutionReviewStatus,
      })
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    if (!existing) {
      return successResponse({ error: 'Question not found' }, 404);
    }

    // Validate the question is in a valid state for review
    if (existing.status !== 'active') {
      return successResponse(
        { error: 'Question is not active and cannot be reviewed' },
        400
      );
    }

    if (!existing.requiresManualReview) {
      return successResponse(
        { error: 'Question does not require manual review' },
        400
      );
    }

    if (existing.resolutionReviewStatus === 'approved') {
      return successResponse({ error: 'Question already approved' }, 400);
    }

    const now = new Date();

    if (action === 'approve') {
      await db
        .update(questions)
        .set({
          resolutionReviewStatus: 'approved',
          resolutionReviewedAt: now,
          resolutionReviewedBy: admin.userId,
          updatedAt: now,
        })
        .where(eq(questions.id, id));

      logger.info(
        'Resolution approved',
        {
          questionId: id,
          questionNumber: existing.questionNumber,
          reviewedBy: admin.userId,
        },
        'AdminResolutions'
      );

      return successResponse({ success: true });
    }

    // Reject: clear the review flag and postpone resolution to avoid immediate retry loops.
    const postponed = new Date(now.getTime() + POSTPONE_HOURS * 60 * 60 * 1000);

    await db
      .update(questions)
      .set({
        requiresManualReview: false,
        resolutionReviewStatus: 'rejected',
        resolutionReviewedAt: now,
        resolutionReviewedBy: admin.userId,
        resolutionConfidence: null,
        resolutionProofUrl: null,
        resolutionDescription: null,
        resolutionDate: postponed,
        updatedAt: now,
      })
      .where(eq(questions.id, id));

    logger.info(
      'Resolution rejected',
      {
        questionId: id,
        questionNumber: existing.questionNumber,
        reviewedBy: admin.userId,
        postponedUntil: postponed.toISOString(),
      },
      'AdminResolutions'
    );

    return successResponse({
      success: true,
      postponedUntil: postponed.toISOString(),
    });
  }
);
