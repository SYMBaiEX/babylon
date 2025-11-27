import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@babylon/db';
import { authenticate } from '@babylon/api';
import { logger } from '@babylon/shared';
import { issueRealtimeToken, type RealtimeChannel } from '@babylon/api';

const BodySchema = z.object({
  channels: z.array(z.string()).optional(),
  chatIds: z.array(z.string()).optional(),
  includeNotifications: z.coerce.boolean().optional(),
  ttlSeconds: z.number().int().positive().max(3600).optional(),
});

const PUBLIC_CHANNELS: RealtimeChannel[] = [
  'feed',
  'markets',
  'breaking-news',
  'upcoming-events',
];

const dedupe = <T>(items: T[]) => Array.from(new Set(items));
const isDmChatId = (id: string, userId: string) => {
  if (!id.startsWith('dm-')) return false;
  const parts = id.substring('dm-'.length).split('-').filter(Boolean);
  if (parts.length !== 2) return false;
  return parts.includes(userId);
};

export async function POST(request: NextRequest) {
  const user = await authenticate(request);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // ignore empty body
  }

  const {
    channels = [],
    chatIds = [],
    includeNotifications = true,
    ttlSeconds,
  } = BodySchema.parse(body);

  const requestedChannels = channels.filter(Boolean) as RealtimeChannel[];
  const baseChannels = [...PUBLIC_CHANNELS];

  if (includeNotifications) {
    baseChannels.push(`notifications:${user.userId}`);
  }

  const derivedChatIds = dedupe([
    ...chatIds,
    ...requestedChannels
      .filter((ch) => ch.startsWith('chat:'))
      .map((ch) => ch.replace('chat:', '')),
  ]).filter(Boolean);

  // Determine which chats are authorized for this user.
  const allowedChatIds = new Set<string>();

  if (derivedChatIds.length > 0) {
    const allowedChats = await db.chatParticipant.findMany({
      where: { userId: user.userId, chatId: { in: derivedChatIds } },
      select: { chatId: true },
    });
    allowedChats.forEach((c) => allowedChatIds.add(c.chatId));
  }

  // Allow deterministic DM channels even if the chat row/participants are not yet created.
  for (const chId of derivedChatIds) {
    if (isDmChatId(chId, user.userId)) {
      allowedChatIds.add(chId);
    }
  }

  const unauthorizedChats = derivedChatIds.filter(
    (id) => !allowedChatIds.has(id)
  );
  if (unauthorizedChats.length > 0) {
    logger.warn(
      'Realtime token: unauthorized chat channels requested',
      { userId: user.userId, unauthorizedChats },
      'Realtime'
    );
    return NextResponse.json(
      { error: 'Unauthorized chat channels', unauthorizedChats },
      { status: 403 }
    );
  }

  const chatChannels: RealtimeChannel[] = Array.from(allowedChatIds).map(
    (id) => `chat:${id}` as RealtimeChannel
  );

  // Only allow explicitly known public channels from the request
  const requestedPublic = requestedChannels.filter((ch) =>
    PUBLIC_CHANNELS.includes(ch)
  );

  const finalChannels = dedupe([
    ...baseChannels,
    ...requestedPublic,
    ...chatChannels,
  ]);

  if (finalChannels.length === 0) {
    return NextResponse.json(
      { error: 'No channels authorized' },
      { status: 403 }
    );
  }

  const token = issueRealtimeToken({
    userId: user.userId,
    channels: finalChannels,
    ttlSeconds: ttlSeconds ?? 900,
  });

  const expiresAt = Date.now() + (ttlSeconds ?? 900) * 1000;

  logger.info(
    'Issued realtime token',
    { userId: user.userId, channels: finalChannels },
    'Realtime'
  );

  return NextResponse.json({
    token,
    channels: finalChannels,
    expiresAt,
  });
}
