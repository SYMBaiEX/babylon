import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';
import { connections } from '@/lib/realtime/connection-registry';
import { generateConnectionId, verifyRealtimeToken, type RealtimeChannel, toStreamKey } from '@/lib/realtime';
import { streamRead, redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max for SSE connections

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUBLIC_CHANNELS = new Set<RealtimeChannel>([
  'feed',
  'markets',
  'breaking-news',
  'upcoming-events',
]);

const MAX_CHANNELS = 50;

interface CursorMap {
  [channel: string]: string;
}

const parseCursor = (raw: string | null): CursorMap => {
  if (!raw) return {};
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as CursorMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

async function filterChannelsForUser(
  userId: string,
  requested: RealtimeChannel[]
): Promise<RealtimeChannel[]> {
  const safeChannels: RealtimeChannel[] = [];

  const chatIds = requested
    .filter((ch) => ch.startsWith('chat:'))
    .map((ch) => ch.replace('chat:', ''));

  const allowedChats =
    chatIds.length > 0
      ? await prisma.chatParticipant.findMany({
          where: { userId, chatId: { in: chatIds } },
          select: { chatId: true },
        })
      : [];

  const allowedChatIds = new Set(allowedChats.map((c) => c.chatId));

  for (const channel of requested) {
    if (PUBLIC_CHANNELS.has(channel)) {
      safeChannels.push(channel);
    } else if (channel.startsWith('chat:')) {
      const chatId = channel.replace('chat:', '');
      if (allowedChatIds.has(chatId)) {
        safeChannels.push(channel);
      } else {
        logger.warn('Dropping unauthorized chat channel', { userId, chatId }, 'SSE');
      }
    } else if (channel.startsWith('notifications:')) {
      const targetUserId = channel.replace('notifications:', '');
      if (targetUserId === userId) {
        safeChannels.push(channel);
      }
    }
  }

  // Deduplicate while preserving order
  return Array.from(new Set(safeChannels));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenParam = searchParams.get('token');
  const channelsParam = searchParams.get('channels');
  const cursorParam = searchParams.get('cursor');

  if (!tokenParam) {
    return new Response('Missing token', { status: 401 });
  }

  // Try realtime token first
  const realtimePayload = verifyRealtimeToken(tokenParam);
  let userId: string | null = realtimePayload?.userId ?? null;
  let allowedChannels: RealtimeChannel[] = realtimePayload?.channels ?? [];

  // Fallback: treat token as Privy auth token (legacy mode)
  if (!realtimePayload) {
    const modifiedRequest = new NextRequest(request.url, {
      headers: {
        Authorization: `Bearer ${tokenParam}`,
      },
    });
    const user = await authenticate(modifiedRequest);
    userId = user.userId;
    const requested = channelsParam
      ? (channelsParam.split(',') as RealtimeChannel[])
      : ['feed'];
    allowedChannels = await filterChannelsForUser(user.userId, requested);
  }

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!redis) {
    logger.error('Redis/Upstash not configured - realtime disabled', undefined, 'SSE');
    return new Response('Realtime unavailable', { status: 503 });
  }

  if (allowedChannels.length === 0) {
    return new Response('No channels authorized', { status: 403 });
  }

  if (allowedChannels.length > MAX_CHANNELS) {
    return new Response('Too many channels requested', { status: 400 });
  }

  const encoder = new TextEncoder();
  const connectionId = generateConnectionId();
  const cursors = parseCursor(cursorParam);
  const streamKeys = allowedChannels.map(toStreamKey);
  const keyToChannel = new Map(streamKeys.map((k, idx) => [k, allowedChannels[idx]]));
  const lastIds = new Map<string, string>();

  const stream = new ReadableStream({
    start: async (controller) => {
      connections.add({
        id: connectionId,
        userId,
        channels: allowedChannels,
        connectedAt: Date.now(),
      });

      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
          return true;
        } catch {
          return false;
        }
      };

      // Initial connected event
      send(
        `event: connected\n` +
          `data: ${JSON.stringify({
            connectionId,
            channels: allowedChannels,
            timestamp: Date.now(),
          })}\n\n`
      );

      const abortListener = () => {
        controller.close();
      };
      request.signal.addEventListener('abort', abortListener, { once: true });

      while (!request.signal.aborted) {
        const ids = streamKeys.map((k) => {
          const channelName = keyToChannel.get(k)
          const cursorId = channelName ? cursors[channelName] : undefined
          return lastIds.get(k) || cursorId || '>'
        });

        const messages = await streamRead(streamKeys, ids, { count: 100 });

        if (messages.length === 0) {
          await sleep(1000, request.signal);
          continue;
        }

        for (const msg of messages) {
          const channel = keyToChannel.get(msg.stream);
          if (!channel) continue;

          const payload = msg.payload as {
            type?: string;
            data?: unknown;
            timestamp?: number;
            channel?: string;
            version?: string;
          };

          const eventType = typeof payload.type === 'string' ? payload.type : 'message';
          const sseData = JSON.stringify({
            channel,
            type: eventType,
            data: payload.data ?? payload,
            timestamp: payload.timestamp ?? Date.now(),
            version: payload.version,
          });

          const packet = `id: ${msg.id}\nevent: ${eventType}\ndata: ${sseData}\n\n`;
          const ok = send(packet);
          if (!ok) {
            logger.debug('Failed to enqueue SSE payload (client disconnected)', { connectionId }, 'SSE');
            controller.close();
            break;
          }

          lastIds.set(msg.stream, msg.id);
        }
      }

      connections.remove(connectionId);
    },
    cancel() {
      connections.remove(connectionId);
    },
  });

  logger.info(
    'SSE connection established',
    { userId, connectionId, channels: allowedChannels },
    'SSE'
  );

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
