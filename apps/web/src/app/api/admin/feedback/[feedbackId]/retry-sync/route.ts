/**
 * Admin Feedback Retry Sync API
 *
 * Allows admins to manually retry Linear sync for failed feedback items.
 */

import {
  errorResponse,
  getLinearConfig,
  requireAdmin,
  successResponse,
  syncFeedbackToLinear,
  withErrorHandling,
} from '@babylon/api';
import { db } from '@babylon/db';
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
});

type LinearSyncedMetadata = z.infer<typeof LinearSyncedMetadataSchema>;

/**
 * Safely parse feedback metadata from DB, returning validated Linear sync fields.
 * Returns a safe default object if parsing fails.
 */
function parseLinearSyncedMetadata(rawMetadata: unknown): LinearSyncedMetadata {
  const normalizedMetadata =
    rawMetadata && typeof rawMetadata === 'object' ? rawMetadata : {};
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

    // Check Linear configuration
    const linearConfig = getLinearConfig();
    if (!linearConfig) {
      return errorResponse(
        'Linear integration not configured. Set LINEAR_API_KEY and LINEAR_TEAM_ID.',
        'LINEAR_NOT_CONFIGURED',
        400
      );
    }

    // Fetch feedback to verify it exists and get user info
    const feedback = await db.feedback.findUnique({
      where: { id: feedbackId },
      select: {
        id: true,
        fromUserId: true,
        metadata: true,
      },
    });

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

    // Get user info for the sync
    const user = feedback.fromUserId
      ? await db.user.findUnique({
          where: { id: feedback.fromUserId },
          select: { id: true, email: true },
        })
      : null;

    if (!user) {
      return errorResponse(
        'User not found for feedback',
        'USER_NOT_FOUND',
        400
      );
    }

    // Perform sync (not fire-and-forget - we want to return the result)
    await syncFeedbackToLinear(linearConfig, feedbackId, user);

    // Fetch updated feedback to get Linear issue info
    const updatedFeedback = await db.feedback.findUnique({
      where: { id: feedbackId },
      select: { metadata: true },
    });

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
