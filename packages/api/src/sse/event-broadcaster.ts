/**
 * SSE Event Broadcaster
 *
 * @description Publishes events to Redis Streams for SSE delivery. Events are
 * broadcast to channels and consumed by SSE handlers via `XREAD` per-connection.
 * Provides high-level functions for broadcasting to channels and chat rooms.
 */

import { logger } from '@babylon/shared';
import { publishEvent, type RealtimeChannel } from '../realtime';
import type { JsonValue } from '../types';

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
    type?: string;
    createdAt: string;
    isGameChat?: boolean;
    isDMChat?: boolean;
  }
): Promise<void> {
  logger.info(
    'Broadcasting chat message',
    { chatId, messageId: message.id },
    'Realtime'
  );
  await broadcastToChannel(`chat:${chatId}`, {
    type: 'new_message',
    message,
  });
}
