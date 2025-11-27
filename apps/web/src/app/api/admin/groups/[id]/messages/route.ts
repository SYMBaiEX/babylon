/**
 * Admin Group Messages API
 *
 * @route GET /api/admin/groups/[id]/messages - Get group messages
 * @access Admin
 *
 * @description
 * Returns all messages in a specific group chat for admin verification
 * and debugging. Includes pagination support.
 *
 * @openapi
 * /api/admin/groups/{id}/messages:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get group messages
 *     description: Returns all messages in a group chat (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group chat ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Messages per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Group not found
 *
 * @example
 * ```typescript
 * const { messages } = await fetch(`/api/admin/groups/${groupId}/messages`, {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling } from '@/lib/errors/error-handler';

/**
 * GET /api/admin/groups/[id]/messages
 * Get all messages in a group chat
 * Admin only
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);

    // Check admin permissions
    const dbUser = await db.user.findUnique({
      where: { id: user.userId },
      select: { isAdmin: true },
    });

    if (!dbUser?.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { id: chatId } = await context.params;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '100');
    const offset = Number.parseInt(searchParams.get('offset') || '0');

    // Get chat details
    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        name: true,
        isGroup: true,
        createdAt: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Get total message count
    const totalMessages = await db.message.count({
      where: { chatId },
    });

    // Get messages with pagination
    const messages = await db.message.findMany({
      where: { chatId },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit,
    });

    // Get sender details
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const [users, actors] = await Promise.all([
      db.user.findMany({
        where: { id: { in: senderIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          isActor: true,
          profileImageUrl: true,
        },
      }),
      db.actor.findMany({
        where: { id: { in: senderIds } },
        select: {
          id: true,
          name: true,
          profileImageUrl: true,
        },
      }),
    ]);

    const enrichedMessages = messages.map((m) => {
      const user = users.find((u) => u.id === m.senderId);
      const actor = actors.find((a) => a.id === m.senderId);

      return {
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        sender: {
          id: m.senderId,
          name: user?.displayName || user?.username || actor?.name || 'Unknown',
          username: user?.username || null,
          isNPC: !!actor || user?.isActor,
          profileImageUrl: user?.profileImageUrl || actor?.profileImageUrl,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        chat: {
          id: chat.id,
          name: chat.name,
          isGroup: chat.isGroup,
          createdAt: chat.createdAt,
        },
        messages: enrichedMessages,
        pagination: {
          total: totalMessages,
          offset,
          limit,
          hasMore: offset + limit < totalMessages,
        },
      },
    });
  }
);
