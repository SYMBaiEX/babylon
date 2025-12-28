/**
 * Sync feedback to Linear by creating an issue.
 * This function is designed to be fire-and-forget from the API route.
 */

import { db, type JsonValue } from '@babylon/db';
import { logger } from '@babylon/shared';
import { createLinearIssue } from './client';
import { formatFeedbackForLinear, type FeedbackType } from './format-feedback';

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

  logger.info('Linear issue created for feedback', {
    feedbackId,
    issueId: issue.id,
    identifier: issue.identifier,
  });
}

