/**
 * Sync feedback to Linear by creating an issue.
 * This function is designed to be fire-and-forget from the API route.
 * Includes retry logic with exponential backoff for transient failures.
 *
 * Uses pure Drizzle ORM throughout for consistency.
 */

import {
  feedbacks,
  getRawDrizzle,
  type JsonObject,
  type JsonValue,
} from '@babylon/db';
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
 * Helper to safely parse JSON metadata from database result.
 */
function parseJsonMetadata(raw: JsonValue | null | undefined): JsonObject {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as JsonObject)
    : {};
}

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
  comment: string | null;
  metadata: JsonObject;
  createdAt: Date;
  reason?: 'not_found' | 'already_synced' | 'lock_held';
}> {
  // Calculate the stale threshold timestamp
  const staleThreshold = new Date(Date.now() - ttlMs).toISOString();

  // Atomic lock acquisition using Drizzle's query builder with sql templates:
  // - Only acquires lock if linearIssueId is NULL (not already synced)
  // - Only acquires lock if linearSyncStartedAt is NULL OR older than TTL
  // - Uses RETURNING to get updated row in single round-trip
  const db = getRawDrizzle();
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
      comment: feedbacks.comment,
      metadata: feedbacks.metadata,
      createdAt: feedbacks.createdAt,
    });

  const firstRow = result[0];
  if (firstRow) {
    return {
      lockAcquired: true,
      comment: firstRow.comment,
      metadata: parseJsonMetadata(firstRow.metadata),
      createdAt: firstRow.createdAt,
    };
  }

  // Lock not acquired - determine why for logging using Drizzle select
  const [feedback] = await db
    .select({ metadata: feedbacks.metadata })
    .from(feedbacks)
    .where(eq(feedbacks.id, feedbackId))
    .limit(1);

  if (!feedback) {
    return {
      lockAcquired: false,
      comment: null,
      metadata: {},
      createdAt: new Date(),
      reason: 'not_found',
    };
  }

  const syncMetadata = LinearSyncMetadataSchema.parse(
    parseJsonMetadata(feedback.metadata)
  );

  if (syncMetadata.linearIssueId) {
    return {
      lockAcquired: false,
      comment: null,
      metadata: {},
      createdAt: new Date(),
      reason: 'already_synced',
    };
  }

  return {
    lockAcquired: false,
    comment: null,
    metadata: {},
    createdAt: new Date(),
    reason: 'lock_held',
  };
}

/**
 * Atomically clear the sync lock using Drizzle's jsonb_set with path removal.
 * Called on failure to allow immediate retry.
 */
async function clearSyncLock(feedbackId: string): Promise<void> {
  try {
    // Use Drizzle's update with sql template to atomically remove the lock key
    const db = getRawDrizzle();
    await db
      .update(feedbacks)
      .set({
        metadata: sql`${feedbacks.metadata} - 'linearSyncStartedAt'`,
      })
      .where(eq(feedbacks.id, feedbackId));
  } catch (cleanupError) {
    // Log but don't throw - lock will expire naturally after TTL
    logger.warn('Failed to clear sync lock', { feedbackId, cleanupError });
  }
}

/**
 * Syncs a feedback record to Linear by creating an issue.
 * Updates the feedback metadata with the Linear issue reference.
 *
 * Uses atomic lock acquisition to prevent duplicate issues from concurrent requests.
 * Idempotent: If feedback already has a linearIssueId, skips creation.
 *
 * All database operations use Drizzle ORM for consistency.
 */
export async function syncFeedbackToLinear(
  config: LinearConfig,
  feedbackId: string,
  user: FeedbackUser
): Promise<void> {
  // Atomically acquire sync lock - this eliminates TOCTOU race conditions
  // Also returns the feedback data in the same round-trip
  const syncStartedAt = new Date().toISOString();
  const lockResult = await acquireSyncLock(
    feedbackId,
    syncStartedAt,
    SYNC_LOCK_TTL_MS
  );

  if (!lockResult.lockAcquired) {
    switch (lockResult.reason) {
      case 'not_found':
        logger.warn('Feedback not found for Linear sync', { feedbackId });
        break;
      case 'already_synced':
        logger.info('Feedback already synced to Linear, skipping', {
          feedbackId,
        });
        break;
      case 'lock_held':
        logger.info('Linear sync already in progress, skipping', { feedbackId });
        break;
    }
    return;
  }

  // Use metadata from lock acquisition result (no extra DB call needed)
  const metadata: FeedbackMetadata = FeedbackMetadataSchema.parse(
    lockResult.metadata
  );

  const formatted = formatFeedbackForLinear({
    id: feedbackId,
    feedbackType: metadata.feedbackType,
    description: lockResult.comment ?? '',
    stepsToReproduce: metadata.stepsToReproduce,
    screenshotUrl: metadata.screenshotUrl,
    rating: metadata.rating,
    userId: user.id,
    userEmail: user.email,
    username: user.username,
    displayName: user.displayName,
    createdAt: lockResult.createdAt,
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
    await clearSyncLock(feedbackId);
    throw error;
  }

  // Atomically update metadata: remove lock and add issue info in one operation
  // Uses Drizzle's sql template with jsonb operators for atomic update
  const db = getRawDrizzle();
  await db
    .update(feedbacks)
    .set({
      metadata: sql`(${feedbacks.metadata} - 'linearSyncStartedAt') || jsonb_build_object(
        'linearIssueId', ${issue.id}::text,
        'linearIssueIdentifier', ${issue.identifier}::text,
        'linearIssueUrl', ${issue.url}::text
      )`,
    })
    .where(eq(feedbacks.id, feedbackId));

  logger.info('Linear issue created for feedback', {
    feedbackId,
    issueId: issue.id,
    identifier: issue.identifier,
  });
}
