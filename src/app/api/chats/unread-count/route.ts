/**
 * API Route: /api/chats/unread-count
 * Methods: GET (efficiently check for unread/pending messages)
 * 
 * Lightweight endpoint for polling - returns counts only, no chat data
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/chats/unread-count
 * Get counts of pending DMs and unread messages
 * 
 * Returns:
 * - pendingDMs: Number of DM requests from anons awaiting acceptance
 * - hasNewMessages: Boolean indicating if there are any new messages
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Check if DMAcceptance table exists (outside of asUser transaction to avoid poisoning it)
  // This is a lightweight check that won't affect the main transaction
  let dmAcceptanceTableExists = false;
  try {
    // Quick check using prisma directly (not in a transaction)
    await prisma.$queryRaw`SELECT 1 FROM "DMAcceptance" LIMIT 1`;
    dmAcceptanceTableExists = true;
  } catch {
    // Table doesn't exist yet - that's okay, we'll skip it
    dmAcceptanceTableExists = false;
  }

  const counts = await asUser(user, async (db) => {
    // Count pending DM requests (efficient - just counts)
    // Only query if table exists to avoid transaction errors
    let pendingDMCount = 0;
    if (dmAcceptanceTableExists) {
      pendingDMCount = await db.dMAcceptance.count({
        where: {
          userId: user.userId,
          status: 'pending',
        },
      });
    }

    // Check if user has any chats with messages created after last read
    // This is a lightweight check - we only need to know YES/NO, not the full data
    const chatsWithParticipation = await db.chatParticipant.findMany({
      where: {
        userId: user.userId,
      },
      select: {
        chatId: true,
      },
    });

    const chatIds = chatsWithParticipation.map(cp => cp.chatId);

    // Check if any of these chats have messages we haven't read
    // For now, we'll just check if there are recent messages in the last 24 hours
    // (A more sophisticated system would track last_read_at per user per chat)
    let recentMessageCount = 0;
    if (chatIds.length > 0) {
      recentMessageCount = await db.message.count({
        where: {
          chatId: {
            in: chatIds,
          },
          senderId: {
            not: user.userId, // Not our own messages
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        take: 1, // We only need to know if ANY exist
      });
    }

    return {
      pendingDMs: pendingDMCount,
      hasNewMessages: recentMessageCount > 0,
    };
  });

  return successResponse(counts);
});

