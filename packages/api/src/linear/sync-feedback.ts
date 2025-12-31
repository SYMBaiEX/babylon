/**
 * Sync feedback to Linear by creating an issue.
 * This function is designed to be fire-and-forget from the API route.
 * Includes retry logic with exponential backoff for transient failures.
 */

import { db, feedbacks, type JsonObject } from '@babylon/db';
import { and, eq, or, sql } from 'drizzle-orm';
import { FeedbackTypeSchema, logger } from '@babylon/shared';
import { z } from 'zod';
import { createLinearIssue } from './client';
import { formatFeedbackForLinear } from './format-feedback';

/** Maximum number of retry attempts for Linear API calls */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff (doubles each retry) */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: { feedbackId: string }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn('Linear API call failed, retrying', {
          feedbackId: context.feedbackId,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: lastError.message,
        });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Zod schema for validating feedback metadata from the database.
 * Ensures type safety when parsing JSON metadata.
 * Reuses FeedbackTypeSchema from shared package for DRY compliance.
 */
const FeedbackMetadataSchema = z.object({
  feedbackType: FeedbackTypeSchema.catch('bug'),
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
  username: string | null;
  displayName: string | null;
}

/**
 * Zod schema for validating Linear sync metadata from the database.
 * Used for idempotency check to prevent duplicate issue creation.
 */
const LinearSyncMetadataSchema = z.object({
  linearIssueId: z.string().optional().catch(undefined),
  linearSyncStartedAt: z.string().optional().catch(undefined),
});

/** How long a sync lock is valid before it's considered stale (5 minutes) */
export const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Atomically acquire a sync lock for Linear issue creation.
 * Uses Drizzle's update().set().where().returning() for atomic conditional updates.
 * This eliminates TOCTOU race conditions by checking and setting in one operation.
 *
 * @returns Object with lockAcquired flag and feedback data if successful
 */
async function acquireSyncLock(
  feedbackId: string,
  syncStartedAt: string,
  ttlMs: number
): Promise<{
  lockAcquired: boolean;
  metadata: JsonObject | null;
  createdAt: Date | null;
  reason?: 'not_found' | 'already_synced' | 'lock_held';
}> {
  // Calculate the stale threshold timestamp
  const staleThreshold = new Date(Date.now() - ttlMs).toISOString();

  // Atomic lock acquisition using Drizzle's query builder with sql templates:
  // - Only acquires lock if linearIssueId is NULL (not already synced)
  // - Only acquires lock if linearSyncStartedAt is NULL OR older than TTL
  // - Uses RETURNING to get updated row in single round-trip
  const result = await db
    .update(feedbacks)
    .set({
      // Use jsonb_set to atomically update the lock timestamp in metadata
      metadata: sql`jsonb_set(
        COALESCE(${feedbacks.metadata}, '{}'::jsonb),
        '{linearSyncStartedAt}',
        to_jsonb(${syncStartedAt}::text)
      )`,
    })
    .where(
      and(
        eq(feedbacks.id, feedbackId),
        // Not already synced to Linear
        sql`${feedbacks.metadata}->>'linearIssueId' IS NULL`,
        // No active lock OR lock is stale
        or(
          sql`${feedbacks.metadata}->>'linearSyncStartedAt' IS NULL`,
          sql`${feedbacks.metadata}->>'linearSyncStartedAt' < ${staleThreshold}`
        )
      )
    )
    .returning({
      id: feedbacks.id,
      metadata: feedbacks.metadata,
      createdAt: feedbacks.createdAt,
    });

  const firstRow = result[0];
  if (firstRow) {
    return {
      lockAcquired: true,
      metadata: firstRow.metadata as JsonObject | null,
      createdAt: firstRow.createdAt,
    };
  }

  // Lock not acquired - determine why for logging
  const feedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { metadata: true },
  });

  if (!feedback) {
    return { lockAcquired: false, metadata: null, createdAt: null, reason: 'not_found' };
  }

  const syncMetadata = LinearSyncMetadataSchema.parse(
    feedback.metadata && typeof feedback.metadata === 'object'
      ? feedback.metadata
      : {}
  );

  if (syncMetadata.linearIssueId) {
    return { lockAcquired: false, metadata: null, createdAt: null, reason: 'already_synced' };
  }

  return { lockAcquired: false, metadata: null, createdAt: null, reason: 'lock_held' };
}

/**
 * Syncs a feedback record to Linear by creating an issue.
 * Updates the feedback metadata with the Linear issue reference.
 *
 * Uses atomic lock acquisition to prevent duplicate issues from concurrent requests.
 * Idempotent: If feedback already has a linearIssueId, skips creation.
 */
export async function syncFeedbackToLinear(
  config: LinearConfig,
  feedbackId: string,
  user: FeedbackUser
): Promise<void> {
  // Atomically acquire sync lock - this eliminates TOCTOU race conditions
  const syncStartedAt = new Date().toISOString();
  const lockResult = await acquireSyncLock(feedbackId, syncStartedAt, SYNC_LOCK_TTL_MS);

  if (!lockResult.lockAcquired) {
    switch (lockResult.reason) {
      case 'not_found':
        logger.warn('Feedback not found for Linear sync', { feedbackId });
        break;
      case 'already_synced':
        logger.info('Feedback already synced to Linear, skipping', { feedbackId });
        break;
      case 'lock_held':
        logger.info('Linear sync already in progress, skipping', { feedbackId });
        break;
    }
    return;
  }

  // Fetch full feedback data now that we have the lock
  const feedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { comment: true, metadata: true, createdAt: true },
  });

  if (!feedback) {
    logger.warn('Feedback not found after lock acquisition', { feedbackId });
    return;
  }

  // Parse metadata from the locked record
  const rawMetadata =
    feedback.metadata && typeof feedback.metadata === 'object'
      ? (feedback.metadata as JsonObject)
      : {};

  // Helper to clear the sync lock (called on failure to allow immediate retry)
  const clearSyncLock = async () => {
    try {
      const current = await db.feedback.findUnique({
        where: { id: feedbackId },
        select: { metadata: true },
      });
      if (!current?.metadata || typeof current.metadata !== 'object') return;

      const currentMetadata = current.metadata as JsonObject;
      const { linearSyncStartedAt: _, ...withoutLock } = currentMetadata;
      await db.feedback.update({
        where: { id: feedbackId },
        data: { metadata: withoutLock },
      });
    } catch (cleanupError) {
      // Log but don't throw - lock will expire naturally after TTL
      logger.warn('Failed to clear sync lock', { feedbackId, cleanupError });
    }
  };

  const metadata: FeedbackMetadata = FeedbackMetadataSchema.parse(rawMetadata);

  const formatted = formatFeedbackForLinear({
    id: feedbackId,
    feedbackType: metadata.feedbackType,
    description: feedback.comment ?? '',
    stepsToReproduce: metadata.stepsToReproduce,
    screenshotUrl: metadata.screenshotUrl,
    rating: metadata.rating,
    userId: user.id,
    userEmail: user.email,
    username: user.username,
    displayName: user.displayName,
    createdAt: feedback.createdAt,
  });

  // Create Linear issue with retry logic for transient failures
  let issue;
  try {
    issue = await withRetry(
      () =>
        createLinearIssue(config.apiKey, {
          teamId: config.teamId,
          title: formatted.title,
          description: formatted.description,
          labelIds: config.gameFeedbackLabelId
            ? [config.gameFeedbackLabelId]
            : undefined,
        }),
      { feedbackId }
    );
  } catch (error) {
    // Clear the sync lock on failure so immediate retry is possible
    await clearSyncLock();
    throw error;
  }

  // Merge update: fetch fresh metadata to preserve concurrent updates.
  // The linearSyncStartedAt lock set earlier prevents duplicate Linear issues
  // from race conditions. This update clears the lock and stores the issue info.
  const freshFeedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { metadata: true },
  });

  const freshMetadata =
    freshFeedback?.metadata && typeof freshFeedback.metadata === 'object'
      ? (freshFeedback.metadata as JsonObject)
      : {};

  // Remove the sync lock and store the issue info
  const { linearSyncStartedAt: _, ...metadataWithoutLock } = freshMetadata;
  await db.feedback.update({
    where: { id: feedbackId },
    data: {
      metadata: {
        ...metadataWithoutLock,
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
