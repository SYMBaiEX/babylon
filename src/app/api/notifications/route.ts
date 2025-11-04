/**
 * Notifications API Route
 *
 * GET /api/notifications - Get user notifications
 * PATCH /api/notifications - Mark notifications as read
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { InternalServerError } from '@/lib/errors';
import { NotificationsQuerySchema, MarkNotificationsReadSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * GET /api/notifications - Get user notifications
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  // Verify prisma is initialized
  if (!prisma || !prisma.notification) {
    logger.error('Prisma client not initialized', { prisma: !!prisma }, 'GET /api/notifications');
    throw new InternalServerError('Database connection error');
  }

  // Parse and validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    limit: searchParams.get('limit'),
    page: searchParams.get('page'),
    unreadOnly: searchParams.get('unreadOnly'),
    type: searchParams.get('type')
  };
  const { limit, unreadOnly, type } = NotificationsQuerySchema.parse(queryParams);

  const where: {
    userId: string
    read?: boolean
    type?: string
  } = {
    userId: authUser.userId,
  };

  if (unreadOnly) {
    where.read = false;
  }

  if (type) {
    where.type = type;
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    include: {
      actor: {
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
        },
      },
    },
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: authUser.userId,
      read: false,
    },
  });

  logger.info('Notifications fetched successfully', { userId: authUser.userId, count: notifications.length, unreadCount }, 'GET /api/notifications');

  return successResponse({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      actorId: n.actorId,
      actor: n.actor ? {
        id: n.actor.id,
        displayName: n.actor.displayName,
        username: n.actor.username,
        profileImageUrl: n.actor.profileImageUrl,
      } : null,
      postId: n.postId,
      commentId: n.commentId,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
});

/**
 * PATCH /api/notifications - Mark notifications as read
 */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  // Verify prisma is initialized
  if (!prisma || !prisma.notification) {
    logger.error('Prisma client not initialized', { prisma: !!prisma }, 'PATCH /api/notifications');
    throw new InternalServerError('Database connection error');
  }

  // Parse and validate request body
  const body = await request.json();
  const { notificationIds, markAllAsRead } = MarkNotificationsReadSchema.parse(body);

  if (markAllAsRead) {
    // Mark all notifications as read
    await prisma.notification.updateMany({
      where: {
        userId: authUser.userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    logger.info('All notifications marked as read', { userId: authUser.userId }, 'PATCH /api/notifications');

    return successResponse({ success: true, message: 'All notifications marked as read' });
  }

  if (notificationIds && notificationIds.length > 0) {
    // Mark specific notifications as read
    await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: authUser.userId, // Ensure user owns these notifications
      },
      data: {
        read: true,
      },
    });

    logger.info('Notifications marked as read', { userId: authUser.userId, count: notificationIds.length }, 'PATCH /api/notifications');

    return successResponse({ success: true, message: 'Notifications marked as read' });
  }

  // This should not happen due to schema validation, but handle gracefully
  throw new InternalServerError('Invalid request: provide notificationIds array or markAllAsRead=true');
});


