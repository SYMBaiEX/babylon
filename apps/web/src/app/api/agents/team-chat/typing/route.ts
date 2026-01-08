/**
 * Team Chat Typing Indicator API
 *
 * @route POST /api/agents/team-chat/typing - Broadcast typing status
 * @access Authenticated
 *
 * @description
 * Broadcasts typing indicator status to the user's Command Center team chat.
 * This allows other participants (and agents) to see when someone is typing.
 */

import { teamChatService } from '@babylon/agents';
import { authenticateUser, broadcastTypingIndicator } from '@babylon/api';
import { db, eq, users } from '@babylon/db';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const user = await authenticateUser(req);

  const body = await req.json();
  const { isTyping } = body as { isTyping: boolean };

  if (typeof isTyping !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'isTyping must be a boolean' },
      { status: 400 }
    );
  }

  // Get user's team chat
  const teamChat = await teamChatService.getTeamChat(user.id);

  if (!teamChat) {
    return NextResponse.json(
      { success: false, error: 'No team chat exists' },
      { status: 404 }
    );
  }

  // Get user display name
  const [userInfo] = await db
    .select({ displayName: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const displayName = userInfo?.displayName || userInfo?.username || 'User';

  // Broadcast typing indicator
  await broadcastTypingIndicator(teamChat.chatId, user.id, displayName, isTyping);

  return NextResponse.json({ success: true });
}

