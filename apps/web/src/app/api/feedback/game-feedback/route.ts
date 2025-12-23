/**
 * General Game Feedback API
 *
 * @route POST /api/feedback/game-feedback - Submit general game feedback
 * @access Authenticated
 *
 * @openapi
 * /api/feedback/game-feedback:
 *   post:
 *     tags:
 *       - Feedback
 *     summary: Submit general game feedback
 *     description: Submits general feedback about the game
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feedbackType
 *               - description
 *             properties:
 *               feedbackType:
 *                 type: string
 *                 enum: [bug, feature_request, performance]
 *               description:
 *                 type: string
 *               stepsToReproduce:
 *                 type: string
 *                 description: Required for bug reports
 *               screenshotUrl:
 *                 type: string
 *                 description: Optional screenshot URL for bug reports
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Required for feature requests
 *     responses:
 *       201:
 *         description: Feedback submitted successfully
 *       400:
 *         description: Invalid input
 */

import {
  authenticate,
  checkRateLimitAndDuplicates,
  createLinearIssue,
  type FeedbackType,
  formatFeedbackForLinear,
  getLinearConfig,
  RATE_LIMIT_CONFIGS,
  requireUserByIdentifier,
  withErrorHandling,
} from '@babylon/api';
import { db, type JsonValue } from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CATEGORY_MAP: Record<FeedbackType, string> = {
  bug: 'bug_report',
  feature_request: 'feature_request',
  performance: 'performance_issue',
};

const GameFeedbackSchema = z
  .object({
    feedbackType: z.enum(['bug', 'feature_request', 'performance']),
    description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
    stepsToReproduce: z.string().max(2000).optional(),
    screenshotUrl: z.string().url().optional().or(z.literal('')),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .refine((data) => data.feedbackType !== 'bug' || !!data.stepsToReproduce, {
    message: 'Steps to reproduce are required for bug reports',
    path: ['stepsToReproduce'],
  })
  .refine((data) => data.feedbackType !== 'feature_request' || data.rating !== undefined, {
    message: 'Rating is required for feature requests',
    path: ['rating'],
  });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  const rateLimitError = checkRateLimitAndDuplicates(
    authUser.userId,
    null,
    RATE_LIMIT_CONFIGS.SUBMIT_FEEDBACK
  );
  if (rateLimitError) return rateLimitError;

  const parsed = GameFeedbackSchema.parse(await request.json());
  const fromUser = await requireUserByIdentifier(authUser.userId);
  const now = new Date();

  const metadata: Record<string, JsonValue> = {
    feedbackType: parsed.feedbackType,
    stepsToReproduce: parsed.stepsToReproduce ?? null,
    screenshotUrl: parsed.screenshotUrl ?? null,
    rating: parsed.rating ?? null,
  };

  const feedback = await db.feedback.create({
    data: {
      id: await generateSnowflakeId(),
      fromUserId: fromUser.id,
      toUserId: null,
      score: parsed.rating ? parsed.rating * 20 : 50,
      comment: parsed.description,
      category: CATEGORY_MAP[parsed.feedbackType],
      interactionType: 'general_game_feedback',
      metadata,
      createdAt: now,
      updatedAt: now,
    },
  });

  logger.info('Game feedback submitted', {
    feedbackId: feedback.id,
    userId: fromUser.id,
    type: parsed.feedbackType,
  });

  const linearConfig = getLinearConfig();
  if (linearConfig) {
    syncFeedbackToLinear(linearConfig, feedback.id, parsed.description, metadata, fromUser).catch(
      (error: unknown) => {
        logger.error('Linear issue creation failed', {
          feedbackId: feedback.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    );
  }

  return NextResponse.json(
    { success: true, feedbackId: feedback.id, message: 'Thank you for your feedback!' },
    { status: 201 }
  );
});

async function syncFeedbackToLinear(
  config: { apiKey: string; teamId: string; gameFeedbackLabelId: string | null },
  feedbackId: string,
  description: string,
  metadata: Record<string, JsonValue>,
  user: { id: string; email: string | null }
): Promise<void> {
  const formatted = formatFeedbackForLinear({
    id: feedbackId,
    feedbackType: metadata.feedbackType as FeedbackType,
    description,
    stepsToReproduce: metadata.stepsToReproduce as string | null,
    screenshotUrl: metadata.screenshotUrl as string | null,
    rating: metadata.rating as number | null,
    userId: user.id,
    userEmail: user.email,
  });

  const issue = await createLinearIssue(config.apiKey, {
    teamId: config.teamId,
    title: formatted.title,
    description: formatted.description,
    labelIds: config.gameFeedbackLabelId ? [config.gameFeedbackLabelId] : undefined,
  });

  await db.feedback.update({
    where: { id: feedbackId },
    data: {
      metadata: {
        ...metadata,
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        linearIssueUrl: issue.url,
      },
    },
  });

  logger.info('Linear issue created', {
    feedbackId,
    issueId: issue.id,
    identifier: issue.identifier,
  });
}
