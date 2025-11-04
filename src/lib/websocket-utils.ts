/**
 * WebSocket Utilities
 * Shared utilities for broadcasting messages to WebSocket clients
 * Separated from API routes to avoid circular dependencies and Privy imports in non-Next.js contexts
 */

import type { JsonValue } from '@/types/common';
import type { WebSocketChannel } from '@/types/websocket';
import { logger } from './logger';

// Re-export the type for convenience
export type { WebSocketChannel };

export interface WebSocketMessage {
  type: 'channel_update';
  data: {
    channel: WebSocketChannel;
    data: Record<string, JsonValue>;
  };
}

// In-memory channel subscribers (shared with WebSocket route)
// This will be populated by the WebSocket route handler
export const channelSubscribers = new Map<WebSocketChannel, Set<string>>();
export const wsClients = new Map<string, WebSocketLike>(); // WebSocket client references

interface WebSocketLike {
  readyState: number;
  send: (data: string) => void;
}

/**
 * Broadcast to a channel (feed, markets, breaking-news, etc.)
 * This is a simplified version that works outside Next.js API context
 */
export function broadcastToChannel(channel: WebSocketChannel, data: Record<string, JsonValue>) {
  const subscribers = channelSubscribers.get(channel);
  if (!subscribers || subscribers.size === 0) return;

  const messageData: WebSocketMessage = {
    type: 'channel_update',
    data: {
      channel,
      data,
    },
  };

  let sentCount = 0;
  subscribers.forEach((userId) => {
    const client = wsClients.get(userId);
    if (client && client.readyState === 1) {
      // WebSocket.OPEN = 1
      try {
        client.send(JSON.stringify(messageData));
        sentCount++;
      } catch {
        // Remove invalid client
        subscribers.delete(userId);
        wsClients.delete(userId);
        logger.debug(`Removed invalid WebSocket client: ${userId}`, undefined, 'WebSocket');
      }
    } else {
      // Remove disconnected client
      subscribers.delete(userId);
      wsClients.delete(userId);
    }
  });

  if (sentCount > 0) {
    logger.debug(`Broadcasted to ${sentCount} clients on channel ${channel}`, { channel, sentCount }, 'WebSocket');
  }
}

/**
 * No-op version for when WebSocket is not available (e.g., in test/build contexts)
 * This prevents errors when importing in non-WebSocket contexts
 */
export function broadcastToChannelSafe(channel: WebSocketChannel, data: Record<string, JsonValue>) {
  try {
    broadcastToChannel(channel, data);
  } catch {
    // Silently fail - WebSocket might not be initialized
    // Errors already logged in broadcastToChannel
  }
}

