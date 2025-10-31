/**
 * Notification Service
 * 
 * Helper functions for creating notifications when users interact
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type NotificationType = 'comment' | 'reaction' | 'follow' | 'mention' | 'reply' | 'share';

interface CreateNotificationParams {
  userId: string; // Who receives the notification
  type: NotificationType;
  actorId?: string; // Who performed the action
  postId?: string;
  commentId?: string;
  message: string;
}

/**
 * Create a notification
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        actorId: params.actorId,
        postId: params.postId,
        commentId: params.commentId,
        message: params.message,
      },
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Create notification for comment on user's post
 */
export async function notifyCommentOnPost(
  postAuthorId: string,
  commentAuthorId: string,
  postId: string,
  commentId: string
): Promise<void> {
  // Don't notify if user commented on their own post
  if (postAuthorId === commentAuthorId) {
    return;
  }

  // Get comment author info for message
  const commentAuthor = await prisma.user.findUnique({
    where: { id: commentAuthorId },
    select: { displayName: true, username: true },
  });

  const authorName = commentAuthor?.displayName || commentAuthor?.username || 'Someone';
  const message = `${authorName} commented on your post`;

  await createNotification({
    userId: postAuthorId,
    type: 'comment',
    actorId: commentAuthorId,
    postId,
    commentId,
    message,
  });
}

/**
 * Create notification for reaction on user's post
 */
export async function notifyReactionOnPost(
  postAuthorId: string,
  reactionUserId: string,
  postId: string,
  reactionType: string = 'like'
): Promise<void> {
  // Don't notify if user reacted to their own post
  if (postAuthorId === reactionUserId) {
    return;
  }

  const reactionUser = await prisma.user.findUnique({
    where: { id: reactionUserId },
    select: { displayName: true, username: true },
  });

  const userName = reactionUser?.displayName || reactionUser?.username || 'Someone';
  const action = reactionType === 'like' ? 'liked' : reactionType;
  const message = `${userName} ${action} your post`;

  await createNotification({
    userId: postAuthorId,
    type: 'reaction',
    actorId: reactionUserId,
    postId,
    message,
  });
}

/**
 * Create notification for follow
 */
export async function notifyFollow(
  followedUserId: string,
  followerId: string
): Promise<void> {
  // Don't notify if user followed themselves
  if (followedUserId === followerId) {
    return;
  }

  const follower = await prisma.user.findUnique({
    where: { id: followerId },
    select: { displayName: true, username: true },
  });

  const userName = follower?.displayName || follower?.username || 'Someone';
  const message = `${userName} started following you`;

  await createNotification({
    userId: followedUserId,
    type: 'follow',
    actorId: followerId,
    message,
  });
}

/**
 * Create notification for reply to comment
 */
export async function notifyReplyToComment(
  commentAuthorId: string,
  replyAuthorId: string,
  postId: string,
  commentId: string,
  replyCommentId: string
): Promise<void> {
  // Don't notify if user replied to their own comment
  if (commentAuthorId === replyAuthorId) {
    return;
  }

  const replyAuthor = await prisma.user.findUnique({
    where: { id: replyAuthorId },
    select: { displayName: true, username: true },
  });

  const userName = replyAuthor?.displayName || replyAuthor?.username || 'Someone';
  const message = `${userName} replied to your comment`;

  await createNotification({
    userId: commentAuthorId,
    type: 'reply',
    actorId: replyAuthorId,
    postId,
    commentId: replyCommentId,
    message,
  });
}

/**
 * Create notification for share/repost
 */
export async function notifyShare(
  postAuthorId: string,
  sharerId: string,
  postId: string
): Promise<void> {
  // Don't notify if user shared their own post
  if (postAuthorId === sharerId) {
    return;
  }

  const sharer = await prisma.user.findUnique({
    where: { id: sharerId },
    select: { displayName: true, username: true },
  });

  const userName = sharer?.displayName || sharer?.username || 'Someone';
  const message = `${userName} shared your post`;

  await createNotification({
    userId: postAuthorId,
    type: 'share',
    actorId: sharerId,
    postId,
    message,
  });
}


