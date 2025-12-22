/**
 * Admin Content Moderation Action API
 *
 * @route POST /api/admin/content-queue/[contentId] - Moderate content
 * @access Admin
 *
 * @description
 * Performs moderation actions on flagged content (approve, hide, delete).
 * Uses soft delete (deletedAt) for hiding content.
 */

import {
  checkRateLimitAndDuplicates,
  logAdminModify,
  RATE_LIMIT_CONFIGS,
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { comments, db, eq, posts, reports } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

/**
 * Moderation action types:
 * - approve: Mark content as reviewed and acceptable, dismiss associated reports
 * - hide: Soft delete content (set deletedAt), keeps data for potential recovery
 *
 * NOTE: "delete" was removed as it was redundant with "hide". Both performed
 * soft deletes. If hard delete is needed in the future, it should be a
 * separate, more privileged action with additional safeguards.
 */
interface ModerateRequest {
  action: 'approve' | 'hide';
  contentType: 'post' | 'comment';
  reason?: string;
}

export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ contentId: string }> }
  ) => {
    const admin = await requireAdmin(request);

    // Rate limit admin actions to prevent abuse
    const rateLimitResponse = checkRateLimitAndDuplicates(
      admin.userId,
      null,
      RATE_LIMIT_CONFIGS.ADMIN_ACTION
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { contentId } = await params;

    const body = (await request.json()) as ModerateRequest;
    const { action, contentType, reason } = body;

    logger.info(
      'Content moderation action',
      { contentId, action, contentType, adminId: admin.userId },
      'POST /api/admin/content-queue/[contentId]'
    );

    if (contentType === 'post') {
      // Handle post moderation
      const [existingPost] = await db
        .select({ id: posts.id, deletedAt: posts.deletedAt })
        .from(posts)
        .where(eq(posts.id, contentId))
        .limit(1);

      if (!existingPost) {
        return successResponse({ error: 'Post not found' }, 404);
      }

      if (action === 'approve') {
        // Mark reports as dismissed
        await db
          .update(reports)
          .set({
            status: 'dismissed',
            resolution: 'Content approved by admin',
            resolvedBy: admin.userId,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(reports.reportedPostId, contentId));

        await logAdminModify({
          adminId: admin.userId,
          resourceType: 'post',
          resourceId: contentId,
          previousValue: { status: 'pending' },
          newValue: { status: 'approved' },
          ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { action: 'approve' },
        });
      } else if (action === 'hide') {
        // Soft delete by setting deletedAt (content can be recovered if needed)
        await db
          .update(posts)
          .set({ deletedAt: new Date() })
          .where(eq(posts.id, contentId));

        // Mark reports as resolved
        await db
          .update(reports)
          .set({
            status: 'resolved',
            resolution: reason || 'Content hidden by admin',
            resolvedBy: admin.userId,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(reports.reportedPostId, contentId));

        await logAdminModify({
          adminId: admin.userId,
          resourceType: 'post',
          resourceId: contentId,
          previousValue: { deletedAt: null },
          newValue: {
            deletedAt: new Date().toISOString(),
            reason: reason ?? null,
          },
          ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { action: 'hide' },
        });
      }
    } else if (contentType === 'comment') {
      // Handle comment moderation
      const [existingComment] = await db
        .select({ id: comments.id, deletedAt: comments.deletedAt })
        .from(comments)
        .where(eq(comments.id, contentId))
        .limit(1);

      if (!existingComment) {
        return successResponse({ error: 'Comment not found' }, 404);
      }

      if (action === 'approve') {
        await logAdminModify({
          adminId: admin.userId,
          resourceType: 'comment',
          resourceId: contentId,
          previousValue: { status: 'pending' },
          newValue: { status: 'approved' },
          ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { action: 'approve' },
        });
      } else if (action === 'hide') {
        await db
          .update(comments)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(comments.id, contentId));

        await logAdminModify({
          adminId: admin.userId,
          resourceType: 'comment',
          resourceId: contentId,
          previousValue: { deletedAt: null },
          newValue: {
            deletedAt: new Date().toISOString(),
            reason: reason ?? null,
          },
          ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { action: 'hide' },
        });
      }
    }

    return successResponse({
      success: true,
      action,
      contentId,
      contentType,
    });
  }
);
