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
import {
  type FeedbackType as SharedFeedbackType,
  GameFeedbackSchema,
  generateSnowflakeId,
  logger,
} from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CATEGORY_MAP: Record<SharedFeedbackType, string> = {
  bug: 'bug_report',
  feature_request: 'feature_request',
  performance: 'performance_issue',
};

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
    syncFeedbackToLinear(linearConfig, feedback.id, fromUser).catch(
      (error: unknown) => {
        // Distinguish timeout errors from other API errors for better observability
        if (error instanceof Error && error.name === 'AbortError') {
          logger.warn('Linear issue creation timed out', {
            feedbackId: feedback.id,
          });
        } else {
          logger.error('Linear issue creation failed', {
            feedbackId: feedback.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );
  }

  return NextResponse.json(
    {
      success: true,
      feedbackId: feedback.id,
      message: 'Thank you for your feedback!',
    },
    { status: 201 }
  );
});

async function syncFeedbackToLinear(
  config: {
    apiKey: string;
    teamId: string;
    gameFeedbackLabelId: string | null;
  },
  feedbackId: string,
  user: { id: string; email: string | null }
): Promise<void> {
  // Fetch feedback from DB to get current state (ensures consistency)
  const feedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { comment: true, metadata: true },
  });

  if (!feedback) {
    logger.warn('Feedback not found for Linear sync', { feedbackId });
    return;
  }

  const metadata =
    feedback.metadata && typeof feedback.metadata === 'object'
      ? (feedback.metadata as Record<string, JsonValue>)
      : {};

  const formatted = formatFeedbackForLinear({
    id: feedbackId,
    feedbackType: (metadata.feedbackType as FeedbackType) ?? 'bug',
    description: feedback.comment ?? '',
    stepsToReproduce: (metadata.stepsToReproduce as string | null) ?? null,
    screenshotUrl: (metadata.screenshotUrl as string | null) ?? null,
    rating: (metadata.rating as number | null) ?? null,
    userId: user.id,
    userEmail: user.email,
  });

  const issue = await createLinearIssue(config.apiKey, {
    teamId: config.teamId,
    title: formatted.title,
    description: formatted.description,
    labelIds: config.gameFeedbackLabelId
      ? [config.gameFeedbackLabelId]
      : undefined,
  });

  // Atomic update: merge Linear info with existing metadata
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
