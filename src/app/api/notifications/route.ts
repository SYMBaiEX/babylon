/**
 * Notifications API Route
 * 
 * GET /api/notifications - Get user notifications
 * PATCH /api/notifications - Mark notifications as read
 */

import type { NextRequest } from 'next/server';
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * GET /api/notifications - Get user notifications
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await authenticate(request);
    if (!authUser) {
      return errorResponse('Authentication required', 401);
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

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
  } catch (error) {
    logger.error('Error fetching notifications:', error, 'GET /api/notifications');
    return errorResponse('Failed to fetch notifications', 500);
  }
}

/**
 * PATCH /api/notifications - Mark notifications as read
 */
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await authenticate(request);
    if (!authUser) {
      return errorResponse('Authentication required', 401);
    }

    const body = await request.json();
    const { notificationIds, markAllAsRead } = body;

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

      return successResponse({ success: true, message: 'All notifications marked as read' });
    }

    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
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

      return successResponse({ success: true, message: 'Notifications marked as read' });
    }

    return errorResponse('Invalid request: provide notificationIds array or markAllAsRead=true', 400);
  } catch (error) {
    logger.error('Error updating notifications:', error, 'PATCH /api/notifications');
    return errorResponse('Failed to update notifications', 500);
  }
}


