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
  logAdminModify,
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { comments, db, eq, posts, reports } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

interface ModerateRequest {
  action: 'approve' | 'hide' | 'delete';
  contentType: 'post' | 'comment';
  reason?: string;
}

export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ contentId: string }> }
  ) => {
    const admin = await requireAdmin(request);
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
      } else if (action === 'hide' || action === 'delete') {
        // Soft delete by setting deletedAt
        await db
          .update(posts)
          .set({ deletedAt: new Date() })
          .where(eq(posts.id, contentId));

        // Mark reports as resolved
        await db
          .update(reports)
          .set({
            status: 'resolved',
            resolution: reason || `Content ${action}d by admin`,
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
          newValue: { deletedAt: new Date().toISOString(), reason: reason ?? null },
          ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { action },
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
      } else if (action === 'hide' || action === 'delete') {
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
          newValue: { deletedAt: new Date().toISOString(), reason: reason ?? null },
          ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { action },
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
