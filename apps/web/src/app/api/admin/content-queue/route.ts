/**
 * Admin Content Moderation Queue API
 *
 * @route GET /api/admin/content-queue - Get flagged content for review
 * @access Admin
 *
 * @description
 * Returns posts and comments that have been reported for moderation review.
 * Supports filtering by content type and status.
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import {
  and,
  comments,
  db,
  desc,
  eq,
  isNull,
  posts,
  sql,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get('type') || 'all'; // 'all', 'posts', 'comments'
  const status = searchParams.get('status') || 'pending'; // 'pending', 'resolved'
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  logger.info(
    'Content queue requested',
    { contentType, status, limit },
    'GET /api/admin/content-queue'
  );

  // Get reported posts with details
  const reportedPosts =
    contentType === 'comments'
      ? []
      : await db
          .select({
            id: posts.id,
            content: posts.content,
            createdAt: posts.createdAt,
            deletedAt: posts.deletedAt,
            authorId: posts.authorId,
            imageUrl: posts.imageUrl,
            authorUsername: users.username,
            authorDisplayName: users.displayName,
            authorProfileImage: users.profileImageUrl,
            authorIsActor: users.isActor,
            reportCount: sql<number>`(
              SELECT COUNT(*) FROM "Report" 
              WHERE "Report"."reportedPostId" = ${posts.id}
            )`,
          })
          .from(posts)
          .innerJoin(users, eq(posts.authorId, users.id))
          .where(
            and(
              sql`EXISTS (
                SELECT 1 FROM "Report" 
                WHERE "Report"."reportedPostId" = ${posts.id}
                AND "Report"."status" = ${status}
              )`,
              status === 'pending' ? isNull(posts.deletedAt) : undefined
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(limit);

  // Get reported comments (comments that are associated with reported posts)
  // The reports table links to posts, so we get comments from reported posts
  const reportedComments =
    contentType === 'posts'
      ? []
      : await db
          .select({
            id: comments.id,
            content: comments.content,
            createdAt: comments.createdAt,
            deletedAt: comments.deletedAt,
            postId: comments.postId,
            authorId: comments.authorId,
            authorUsername: users.username,
            authorDisplayName: users.displayName,
            authorProfileImage: users.profileImageUrl,
            authorIsActor: users.isActor,
          })
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(
            and(
              sql`EXISTS (
                SELECT 1 FROM "Report" r
                INNER JOIN "Post" p ON r."reportedPostId" = p.id
                WHERE p.id = ${comments.postId}
                AND r."status" = ${status}
              )`,
              status === 'pending' ? isNull(comments.deletedAt) : undefined
            )
          )
          .orderBy(desc(comments.createdAt))
          .limit(limit);

  // Get queue stats
  const [postStats] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE ${posts.deletedAt} IS NULL)`,
      deleted: sql<number>`COUNT(*) FILTER (WHERE ${posts.deletedAt} IS NOT NULL)`,
    })
    .from(posts)
    .where(
      sql`EXISTS (
        SELECT 1 FROM "Report" 
        WHERE "Report"."reportedPostId" = ${posts.id}
        AND "Report"."status" = 'pending'
      )`
    );

  return successResponse({
    posts: reportedPosts.map((p) => ({
      ...p,
      type: 'post' as const,
      isHidden: p.deletedAt !== null,
      reactionCount: 0,
      commentCount: 0,
      mediaUrls: p.imageUrl ? [p.imageUrl] : [],
    })),
    comments: reportedComments.map((c) => ({
      ...c,
      type: 'comment' as const,
      isHidden: c.deletedAt !== null,
      reactionCount: 0,
      reportCount: 1,
    })),
    stats: {
      posts: {
        pending: Number(postStats?.pending ?? 0),
        hidden: Number(postStats?.deleted ?? 0),
      },
      comments: {
        pending: reportedComments.length,
        hidden: 0,
      },
      totalPending:
        Number(postStats?.pending ?? 0) + reportedComments.length,
    },
  });
});
