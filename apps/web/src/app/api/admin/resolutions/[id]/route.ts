/**
 * Admin Resolution Review Action API
 *
 * @route POST /api/admin/resolutions/[id] - Approve or reject a pending resolution
 * @access Admin
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import { db, eq, questions } from '@babylon/db';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

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
        requiresManualReview: questions.requiresManualReview,
        resolutionReviewStatus: questions.resolutionReviewStatus,
      })
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    if (!existing) {
      return successResponse({ error: 'Question not found' }, 404);
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

      return successResponse({ success: true });
    }

    // Reject: clear the review flag and postpone resolution to avoid immediate retry loops.
    const postponed = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db
      .update(questions)
      .set({
        requiresManualReview: false,
        resolutionReviewStatus: null,
        resolutionReviewedAt: now,
        resolutionReviewedBy: admin.userId,
        resolutionConfidence: null,
        resolutionProofUrl: null,
        resolutionDescription: null,
        resolutionDate: postponed,
        updatedAt: now,
      })
      .where(eq(questions.id, id));

    return successResponse({
      success: true,
      postponedUntil: postponed.toISOString(),
    });
  }
);
