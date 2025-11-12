/**
 * Notifications API Route
 *
 * GET /api/notifications - Get user notifications
 * PATCH /api/notifications - Mark notifications as read
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { InternalServerError } from '@/lib/errors';
import { NotificationsQuerySchema, MarkNotificationsReadSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { getCacheOrFetch, invalidateCache, CACHE_KEYS } from '@/lib/cache-service';

/**
 * GET /api/notifications - Get user notifications
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  // Parse and validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string> = {};
  
  const limit = searchParams.get('limit');
  const page = searchParams.get('page');
  const unreadOnly = searchParams.get('unreadOnly');
  const type = searchParams.get('type');
  
  if (limit) queryParams.limit = limit;
  if (page) queryParams.page = page;
  if (unreadOnly) queryParams.unreadOnly = unreadOnly;
  if (type) queryParams.type = type;
  
  const validated = NotificationsQuerySchema.parse(queryParams);
  const { limit: validatedLimit, unreadOnly: validatedUnreadOnly, type: validatedType } = validated;

  const where: {
    userId: string
    read?: boolean
    type?: string
  } = {
    userId: authUser.userId,
  };

  if (validatedUnreadOnly) {
    where.read = false;
  }

  if (validatedType) {
    where.type = validatedType;
  }

  // OPTIMIZED: Cache notifications with short TTL (high-frequency polling endpoint)
  const cacheKey = `notifications:${authUser.userId}:${JSON.stringify(where)}:${validatedLimit}`;
  
  const { notifications, unreadCount } = await getCacheOrFetch(
    cacheKey,
    async () => {
      return await asUser(authUser, async (db) => {
        const notifications = await db.notification.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
          take: validatedLimit,
          include: {
            User_Notification_actorIdToUser: {
              select: {
                id: true,
                displayName: true,
                username: true,
                profileImageUrl: true,
              },
            },
          },
        });

        const unreadCount = await db.notification.count({
          where: {
            userId: authUser.userId,
            read: false,
          },
        });

        return { notifications, unreadCount };
      });
    },
    {
      namespace: CACHE_KEYS.USER,
      ttl: 10, // 10 second cache (high-frequency endpoint, needs to be fresh)
    }
  );

  logger.info('Notifications fetched successfully', { userId: authUser.userId, count: notifications.length, unreadCount }, 'GET /api/notifications');

  return successResponse({
    notifications: notifications.map((n: typeof notifications[number]) => ({
      id: n.id,
      type: n.type,
      actorId: n.actorId,
      actor: n.User_Notification_actorIdToUser ? {
        id: n.User_Notification_actorIdToUser.id,
        displayName: n.User_Notification_actorIdToUser.displayName,
        username: n.User_Notification_actorIdToUser.username,
        profileImageUrl: n.User_Notification_actorIdToUser.profileImageUrl,
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

  // Parse and validate request body
  const body = await request.json();
  const { notificationIds, markAllAsRead } = MarkNotificationsReadSchema.parse(body);

  await asUser(authUser, async (db) => {
    if (markAllAsRead) {
      // Mark all notifications as read
      await db.notification.updateMany({
        where: {
          userId: authUser.userId,
          read: false,
        },
        data: {
          read: true,
        },
      });

      // Invalidate notification cache after update
      await invalidateCache(`notifications:${authUser.userId}:*`, { namespace: CACHE_KEYS.USER });

      logger.info('All notifications marked as read', { userId: authUser.userId }, 'PATCH /api/notifications');
      return;
    }

    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      await db.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: authUser.userId, // Ensure user owns these notifications
        },
        data: {
          read: true,
        },
      });

      // Invalidate notification cache after update
      await invalidateCache(`notifications:${authUser.userId}:*`, { namespace: CACHE_KEYS.USER });

      logger.info('Notifications marked as read', { userId: authUser.userId, count: notificationIds.length }, 'PATCH /api/notifications');
      return;
    }
  });

  if (markAllAsRead) {
    return successResponse({ success: true, message: 'All notifications marked as read' });
  }

  if (notificationIds && notificationIds.length > 0) {
    return successResponse({ success: true, message: 'Notifications marked as read' });
  }

  // This should not happen due to schema validation, but handle gracefully
  throw new InternalServerError('Invalid request: provide notificationIds array or markAllAsRead=true');
});


