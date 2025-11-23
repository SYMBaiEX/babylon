/**
 * Legacy broadcaster shim.
 *
 * The previous design kept in-memory clients per instance. We now publish to
 * Redis Streams directly so SSE handlers can `XREAD` per-connection. This file
 * keeps the same public functions (`broadcastToChannel`, `broadcastChatMessage`)
 * to avoid touching all call sites.
 */

import type { JsonValue } from '@/types/common';
import { publishEvent, type RealtimeChannel } from '@/lib/realtime';
import { logger } from '@/lib/logger';

export type Channel = RealtimeChannel;

export interface SSEClient {
  id: string;
  userId: string;
  channels: Set<Channel>;
  controller: ReadableStreamDefaultController;
  lastPing: number;
}

export interface BroadcastMessage {
  channel: Channel;
  type: string;
  data: Record<string, JsonValue>;
  timestamp: number;
}

class NoopBroadcaster {
  getStats() {
    return {
      totalClients: 0,
      clientsByChannel: {},
      redisEnabled: true,
    };
  }
  cleanup() {
    // no-op
  }
}

let broadcasterInstance: NoopBroadcaster | null = null;

export function getEventBroadcaster(): NoopBroadcaster {
  if (!broadcasterInstance) {
    broadcasterInstance = new NoopBroadcaster();
  }
  return broadcasterInstance;
}

/**
 * Broadcast a message to a channel (Stream-backed).
 */
export async function broadcastToChannel(
  channel: Channel,
  data: Record<string, JsonValue>
): Promise<void> {
  const message: BroadcastMessage = {
    channel,
    type: (data.type as string) || 'update',
    data,
    timestamp: Date.now(),
  };

  await publishEvent({
    channel,
    type: message.type,
    data,
    timestamp: message.timestamp,
  });
}

/**
 * Broadcast a chat message to a specific chat room.
 */
export async function broadcastChatMessage(
  chatId: string,
  message: {
    id: string;
    content: string;
    chatId: string;
    senderId: string;
    createdAt: string;
    isGameChat?: boolean;
    isDMChat?: boolean;
  }
): Promise<void> {
  logger.info('Broadcasting chat message', { chatId, messageId: message.id }, 'Realtime');
  await broadcastToChannel(`chat:${chatId}`, {
    type: 'new_message',
    message,
  });
}
