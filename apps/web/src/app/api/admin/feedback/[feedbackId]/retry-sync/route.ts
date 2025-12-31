/**
 * Admin Feedback Retry Sync API
 *
 * Allows admins to manually retry Linear sync for failed feedback items.
 * Uses pure Drizzle ORM for all database operations.
 */

import {
  errorResponse,
  getLinearConfig,
  requireAdmin,
  successResponse,
  SYNC_LOCK_TTL_MS,
  syncFeedbackToLinear,
  withErrorHandling,
} from '@babylon/api';
import { eq, feedbacks, users } from '@babylon/db';
import { getRawDrizzle, type JsonValue } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * Zod schema for validating Linear-synced feedback metadata.
 * Uses .catch() to provide safe defaults for missing/malformed fields.
 */
const LinearSyncedMetadataSchema = z.object({
  linearIssueId: z.string().optional().catch(undefined),
  linearIssueIdentifier: z.string().optional().catch(undefined),
  linearIssueUrl: z.string().optional().catch(undefined),
  linearSyncStartedAt: z.string().optional().catch(undefined),
});

type LinearSyncedMetadata = z.infer<typeof LinearSyncedMetadataSchema>;

/**
 * Safely parse feedback metadata from DB, returning validated Linear sync fields.
 * Returns a safe default object if parsing fails.
 */
function parseLinearSyncedMetadata(
  rawMetadata: JsonValue | null | undefined
): LinearSyncedMetadata {
  const normalizedMetadata =
    rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? rawMetadata
      : {};
  return LinearSyncedMetadataSchema.parse(normalizedMetadata);
}

interface RouteContext {
  params: Promise<{ feedbackId: string }>;
}

/**
 * POST /api/admin/feedback/[feedbackId]/retry-sync
 *
 * Manually retry Linear sync for a specific feedback item.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext) => {
    await requireAdmin(request);

    const { feedbackId } = await context.params;
    const db = getRawDrizzle();

    // Check Linear configuration
    const linearConfig = getLinearConfig();
    if (!linearConfig) {
      return errorResponse(
        'Linear integration not configured. Set LINEAR_API_KEY and LINEAR_TEAM_ID.',
        'LINEAR_NOT_CONFIGURED',
        400
      );
    }

    // Fetch feedback to verify it exists and get user info using Drizzle
    const [feedback] = await db
      .select({
        id: feedbacks.id,
        fromUserId: feedbacks.fromUserId,
        metadata: feedbacks.metadata,
      })
      .from(feedbacks)
      .where(eq(feedbacks.id, feedbackId))
      .limit(1);

    if (!feedback) {
      return errorResponse('Feedback not found', 'FEEDBACK_NOT_FOUND', 404);
    }

    // Check if already synced - validate metadata at runtime
    const metadata = parseLinearSyncedMetadata(feedback.metadata);
    if (metadata.linearIssueId) {
      return successResponse({
        success: true,
        alreadySynced: true,
        linearIssue: {
          id: metadata.linearIssueId,
          identifier: metadata.linearIssueIdentifier,
          url: metadata.linearIssueUrl,
        },
        message: 'Feedback already synced to Linear',
      });
    }

    // Check if sync is already in progress (prevents duplicate issues)
    // This provides immediate 409 feedback to admin instead of silent skip
    if (metadata.linearSyncStartedAt) {
      const syncStarted = new Date(metadata.linearSyncStartedAt).getTime();

      // Handle invalid date strings (NaN) by treating as stale lock
      if (!Number.isNaN(syncStarted)) {
        const now = Date.now();
        const lockAgeMs = now - syncStarted;

        if (lockAgeMs < SYNC_LOCK_TTL_MS) {
          const remainingSeconds = Math.ceil(
            (SYNC_LOCK_TTL_MS - lockAgeMs) / 1000
          );
          // Return 409 Conflict to distinguish from success states
          return errorResponse(
            `Sync already in progress. Try again in ${remainingSeconds} seconds or wait for completion.`,
            'SYNC_IN_PROGRESS',
            409
          );
        }
        // Lock is stale, proceed with sync
        logger.warn('Stale sync lock detected during manual retry', {
          feedbackId,
          syncStartedAt: metadata.linearSyncStartedAt,
        });
      } else {
        logger.warn('Invalid linearSyncStartedAt timestamp during manual retry', {
          feedbackId,
          syncStartedAt: metadata.linearSyncStartedAt,
        });
      }
    }

    // Get user info for the sync - distinguish between orphaned feedback and deleted user
    if (!feedback.fromUserId) {
      return errorResponse(
        'Feedback has no associated user (orphaned feedback)',
        'ORPHANED_FEEDBACK',
        400
      );
    }

    // Fetch user using Drizzle
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, feedback.fromUserId))
      .limit(1);

    if (!user) {
      return errorResponse(
        'User for feedback not found (may have been deleted)',
        'USER_NOT_FOUND',
        404
      );
    }

    // Perform sync synchronously - unlike the fire-and-forget pattern in
    // game-feedback submission, we wait for completion to return results.
    // syncFeedbackToLinear updates metadata as a side effect, so we refetch.
    await syncFeedbackToLinear(linearConfig, feedbackId, user);

    // Refetch to get canonical metadata after sync using Drizzle
    const [updatedFeedback] = await db
      .select({ metadata: feedbacks.metadata })
      .from(feedbacks)
      .where(eq(feedbacks.id, feedbackId))
      .limit(1);

    // Validate updated metadata at runtime
    const updatedMetadata = parseLinearSyncedMetadata(updatedFeedback?.metadata);

    logger.info('Manual Linear sync completed', {
      feedbackId,
      linearIssueId: updatedMetadata.linearIssueId,
    });

    return successResponse({
      success: true,
      alreadySynced: false,
      linearIssue: updatedMetadata.linearIssueId
        ? {
            id: updatedMetadata.linearIssueId,
            identifier: updatedMetadata.linearIssueIdentifier,
            url: updatedMetadata.linearIssueUrl,
          }
        : null,
      message: 'Successfully synced to Linear',
    });
  }
);
