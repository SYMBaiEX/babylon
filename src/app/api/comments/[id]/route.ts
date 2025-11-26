/**
 * Comment Management API
 * 
 * @description
 * Edit or delete individual comments. Only comment authors can modify
 * their own comments. Includes cascade deletion of replies and reactions.
 * 
 * **Features:**
 * - Author-only editing
 * - Author-only deletion
 * - Cascade delete (removes replies and reactions)
 * - Content validation
 * - RLS enforcement
 * 
 * @openapi
 * /api/comments/{id}:
 *   patch:
 *     tags:
 *       - Comments
 *     summary: Edit comment
 *     description: Updates comment content (author only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 description: Updated comment content
 *     responses:
 *       200:
 *         description: Comment updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 content:
 *                   type: string
 *                 author:
 *                   type: object
 *                 likeCount:
 *                   type: integer
 *                 replyCount:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not the comment author
 *       404:
 *         description: Comment not found
 *   delete:
 *     tags:
 *       - Comments
 *     summary: Delete comment
 *     description: Deletes comment and all replies (author only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedCommentId:
 *                   type: string
 *                 deletedRepliesCount:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not the comment author
 *       404:
 *         description: Comment not found
 * 
 * @example
 * ```typescript
 * // Edit comment
 * await fetch(`/api/comments/${commentId}`, {
 *   method: 'PATCH',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     content: 'Updated comment text'
 *   })
 * });
 * 
 * // Delete comment
 * const response = await fetch(`/api/comments/${commentId}`, {
 *   method: 'DELETE',
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * const { deletedRepliesCount } = await response.json();
 * console.log(`Deleted comment and ${deletedRepliesCount} replies`);
 * ```
 * 
 * @see {@link /lib/db/context} RLS context
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { db, comments, users, reactions, eq, and, count } from '@/db';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { NotFoundError, AuthorizationError } from '@/lib/errors';
import { IdParamSchema, UpdateCommentSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/comments/[id]
 * Edit a comment (only by the author)
 */
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const { id: commentId } = IdParamSchema.parse(await context.params);

  // Parse and validate request body
  const body = await request.json();
  const { content } = UpdateCommentSchema.parse(body);

  // Find comment
  const [comment] = await db.select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) {
    throw new NotFoundError('Comment', commentId);
  }

  // Check if user is the author
  if (comment.authorId !== user.userId) {
    throw new AuthorizationError('You can only edit your own comments', 'comment', 'edit');
  }

  // Update comment
  const now = new Date();
  const [updatedComment] = await db.update(comments)
    .set({
      content: content.trim(),
      updatedAt: now,
    })
    .where(eq(comments.id, commentId))
    .returning();

  if (!updatedComment) {
    throw new NotFoundError('Comment', commentId);
  }

  // Get user info
  const [commentUser] = await db.select({
    id: users.id,
    displayName: users.displayName,
    username: users.username,
    profileImageUrl: users.profileImageUrl,
  })
    .from(users)
    .where(eq(users.id, updatedComment.authorId))
    .limit(1);

  // Get counts
  const [[likeCountResult], [replyCountResult]] = await Promise.all([
    db.select({ count: count() })
      .from(reactions)
      .where(and(
        eq(reactions.commentId, commentId),
        eq(reactions.type, 'like')
      )),
    db.select({ count: count() })
      .from(comments)
      .where(eq(comments.parentCommentId, commentId)),
  ]);

  const likeCount = Number(likeCountResult?.count ?? 0);
  const replyCount = Number(replyCountResult?.count ?? 0);

  logger.info('Comment updated successfully', { commentId, userId: user.userId }, 'PATCH /api/comments/[id]');

  return successResponse({
    id: updatedComment.id,
    content: updatedComment.content,
    postId: updatedComment.postId,
    authorId: updatedComment.authorId,
    parentCommentId: updatedComment.parentCommentId,
    createdAt: updatedComment.createdAt,
    updatedAt: updatedComment.updatedAt,
    author: commentUser,
    likeCount,
    replyCount,
  });
});

/**
 * DELETE /api/comments/[id]
 * Delete a comment (only by the author)
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  // Authenticate user
  const user = await authenticate(request);
  const { id: commentId } = IdParamSchema.parse(await context.params);

  // Find comment
  const [comment] = await db.select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) {
    throw new NotFoundError('Comment', commentId);
  }

  // Check if user is the author
  if (comment.authorId !== user.userId) {
    throw new AuthorizationError('You can only delete your own comments', 'comment', 'delete');
  }

  // Get reply count before deletion
  const [replyCountResult] = await db.select({ count: count() })
    .from(comments)
    .where(eq(comments.parentCommentId, commentId));
  const repliesCount = Number(replyCountResult?.count ?? 0);

  // Delete reactions on replies first
  const replies = await db.select({ id: comments.id })
    .from(comments)
    .where(eq(comments.parentCommentId, commentId));

  const replyIds = replies.map(r => r.id);
  
  if (replyIds.length > 0) {
    // Delete reactions on replies
    for (const replyId of replyIds) {
      await db.delete(reactions)
        .where(eq(reactions.commentId, replyId));
    }
  }

  // Delete replies
  await db.delete(comments)
    .where(eq(comments.parentCommentId, commentId));

  // Delete reactions on the main comment
  await db.delete(reactions)
    .where(eq(reactions.commentId, commentId));

  // Delete the main comment
  await db.delete(comments)
    .where(eq(comments.id, commentId));

  logger.info('Comment deleted successfully', { commentId, userId: user.userId, deletedRepliesCount: repliesCount }, 'DELETE /api/comments/[id]');

  return successResponse({
    message: 'Comment deleted successfully',
    deletedCommentId: commentId,
    deletedRepliesCount: repliesCount,
  });
});
