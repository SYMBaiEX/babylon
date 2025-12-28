/**
 * Sync feedback to Linear by creating an issue.
 * This function is designed to be fire-and-forget from the API route.
 */

import { db } from '@babylon/db';
import { logger } from '@babylon/shared';
import { z } from 'zod';
import { createLinearIssue } from './client';
import { type FeedbackType, formatFeedbackForLinear } from './format-feedback';

/**
 * Zod schema for validating feedback metadata from the database.
 * Ensures type safety when parsing JSON metadata.
 */
const FeedbackMetadataSchema = z.object({
  feedbackType: z.enum(['bug', 'feature_request', 'performance']).catch('bug'),
  stepsToReproduce: z.string().nullable().catch(null),
  screenshotUrl: z.string().nullable().catch(null),
  rating: z.number().nullable().catch(null),
});

type FeedbackMetadata = z.infer<typeof FeedbackMetadataSchema>;

export interface LinearConfig {
  apiKey: string;
  teamId: string;
  gameFeedbackLabelId: string | null;
}

export interface FeedbackUser {
  id: string;
  email: string | null;
}

/**
 * Syncs a feedback record to Linear by creating an issue.
 * Updates the feedback metadata with the Linear issue reference.
 */
export async function syncFeedbackToLinear(
  config: LinearConfig,
  feedbackId: string,
  user: FeedbackUser
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

  // Safely parse metadata using Zod schema
  const rawMetadata =
    feedback.metadata && typeof feedback.metadata === 'object'
      ? feedback.metadata
      : {};
  const metadata: FeedbackMetadata = FeedbackMetadataSchema.parse(rawMetadata);

  const formatted = formatFeedbackForLinear({
    id: feedbackId,
    feedbackType: metadata.feedbackType as FeedbackType,
    description: feedback.comment ?? '',
    stepsToReproduce: metadata.stepsToReproduce,
    screenshotUrl: metadata.screenshotUrl,
    rating: metadata.rating,
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

  logger.info('Linear issue created for feedback', {
    feedbackId,
    issueId: issue.id,
    identifier: issue.identifier,
  });
}
