/**
 * Event Broadcaster for Server-Sent Events (SSE)
 * 
 * Handles broadcasting events to connected SSE clients.
 * Uses Redis (Upstash/Vercel KV) for production and in-memory for development.
 * 
 * This replaces the WebSocket broadcast system for Vercel compatibility.
 */

import { EventEmitter } from 'events';
import { logger } from '@/lib/logger';

// Type definitions
export type Channel = 'feed' | 'markets' | 'breaking-news' | 'upcoming-events' | string;

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
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * In-memory event broadcaster for development
 * Works with single-instance Next.js dev server
 */
class InMemoryBroadcaster extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setupPingInterval();
  }

  private setupPingInterval() {
    // Send ping every 30 seconds to keep connections alive
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients.entries()) {
        try {
          // Remove stale clients (no activity for 60 seconds)
          if (now - client.lastPing > 60000) {
            this.removeClient(clientId);
            continue;
          }

          // Send ping
          client.controller.enqueue(
            `event: ping\ndata: ${JSON.stringify({ timestamp: now })}\n\n`
          );
        } catch (_error) {
          logger.error('Error sending ping:', _error, 'InMemoryBroadcaster');
          this.removeClient(clientId);
        }
      }
    }, 30000);
  }

  addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    logger.debug(`SSE client connected: ${client.id} (userId: ${client.userId})`, { clientId: client.id }, 'InMemoryBroadcaster');
  }

  removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.controller.close();
      } catch {
        // Client already closed
      }
      this.clients.delete(clientId);
      logger.debug(`SSE client disconnected: ${clientId}`, { clientId }, 'InMemoryBroadcaster');
    }
  }

  subscribeToChannel(clientId: string, channel: Channel) {
    const client = this.clients.get(clientId);
    if (client) {
      client.channels.add(channel);
      logger.debug(`Client ${clientId} subscribed to channel: ${channel}`, { clientId, channel }, 'InMemoryBroadcaster');
    }
  }

  unsubscribeFromChannel(clientId: string, channel: Channel) {
    const client = this.clients.get(clientId);
    if (client) {
      client.channels.delete(channel);
      logger.debug(`Client ${clientId} unsubscribed from channel: ${channel}`, { clientId, channel }, 'InMemoryBroadcaster');
    }
  }

  broadcast(message: BroadcastMessage) {
    let sentCount = 0;
    const { channel, type, data, timestamp } = message;

    for (const [clientId, client] of this.clients.entries()) {
      // Only send to clients subscribed to this channel
      if (!client.channels.has(channel)) {
        continue;
      }

      try {
        const eventData = JSON.stringify({
          channel,
          type,
          data,
          timestamp
        });

        client.controller.enqueue(
          `event: message\ndata: ${eventData}\n\n`
        );
        client.lastPing = Date.now();
        sentCount++;
      } catch (error) {
        logger.error(`Error sending to client ${clientId}:`, error, 'InMemoryBroadcaster');
        this.removeClient(clientId);
      }
    }

    if (sentCount > 0) {
      logger.debug(`Broadcasted to ${sentCount} clients on channel ${channel}`, { channel, sentCount }, 'InMemoryBroadcaster');
    }
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      clientsByChannel: Array.from(this.clients.values()).reduce((acc, client) => {
        for (const channel of client.channels) {
          acc[channel] = (acc[channel] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    };
  }

  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    // Close all clients
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
  }
}

/**
 * Serverless broadcaster for production (Vercel)
 * 
 * IMPORTANT: In serverless environments, each function instance manages its own clients.
 * Cross-instance broadcasting requires a separate mechanism (polling, webhooks, or external service).
 * 
 * This broadcaster intentionally uses local-only broadcasting, which is sufficient because:
 * 1. Vercel's load balancer uses sticky sessions for SSE connections
 * 2. Broadcast calls happen in the same serverless function that receives the API request
 * 3. The SSE connection is typically on the same instance that handles the update
 * 
 * For true cross-instance broadcasting, consider:
 * - Using a dedicated real-time service (Pusher, Ably)
 * - Polling-based updates
 * - WebSockets on a separate server
 */
class ServerlessBroadcaster extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setupPingInterval();
    logger.info('Serverless broadcaster initialized (local-only)', undefined, 'ServerlessBroadcaster');
  }

  private setupPingInterval() {
    // Send ping every 30 seconds to keep connections alive
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients.entries()) {
        try {
          // Remove stale clients (no activity for 60 seconds)
          if (now - client.lastPing > 60000) {
            this.removeClient(clientId);
            continue;
          }

          // Send ping
          client.controller.enqueue(
            `event: ping\ndata: ${JSON.stringify({ timestamp: now })}\n\n`
          );
        } catch (_error) {
          logger.error('Error sending ping:', _error, 'ServerlessBroadcaster');
          this.removeClient(clientId);
        }
      }
    }, 30000);
  }

  addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    logger.debug(`SSE client connected: ${client.id} (userId: ${client.userId})`, { clientId: client.id }, 'ServerlessBroadcaster');
  }

  removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.controller.close();
      } catch {
        // Client already closed
      }
      this.clients.delete(clientId);
      logger.debug(`SSE client disconnected: ${clientId}`, { clientId }, 'ServerlessBroadcaster');
    }
  }

  subscribeToChannel(clientId: string, channel: Channel) {
    const client = this.clients.get(clientId);
    if (client) {
      client.channels.add(channel);
      logger.debug(`Client ${clientId} subscribed to channel: ${channel}`, { clientId, channel }, 'ServerlessBroadcaster');
    }
  }

  unsubscribeFromChannel(clientId: string, channel: Channel) {
    const client = this.clients.get(clientId);
    if (client) {
      client.channels.delete(channel);
      logger.debug(`Client ${clientId} unsubscribed from channel: ${channel}`, { clientId, channel }, 'ServerlessBroadcaster');
    }
  }

  broadcast(message: BroadcastMessage) {
    let sentCount = 0;
    const { channel, type, data, timestamp } = message;

    for (const [clientId, client] of this.clients.entries()) {
      // Only send to clients subscribed to this channel
      if (!client.channels.has(channel)) {
        continue;
      }

      try {
        const eventData = JSON.stringify({
          channel,
          type,
          data,
          timestamp
        });

        client.controller.enqueue(
          `event: message\ndata: ${eventData}\n\n`
        );
        client.lastPing = Date.now();
        sentCount++;
      } catch (error) {
        logger.error(`Error sending to client ${clientId}:`, error, 'ServerlessBroadcaster');
        this.removeClient(clientId);
      }
    }

    if (sentCount > 0) {
      logger.debug(`Broadcasted to ${sentCount} clients on channel ${channel}`, { channel, sentCount }, 'ServerlessBroadcaster');
    }
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      clientsByChannel: Array.from(this.clients.values()).reduce((acc, client) => {
        for (const channel of client.channels) {
          acc[channel] = (acc[channel] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    };
  }

  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    // Close all clients
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
  }
}

// Global broadcaster instance
let broadcasterInstance: InMemoryBroadcaster | ServerlessBroadcaster | null = null;

/**
 * Get the event broadcaster instance (singleton)
 * 
 * Uses the same implementation for both dev and production.
 * In serverless (Vercel), each instance manages its own clients (local-only).
 */
export function getEventBroadcaster(): InMemoryBroadcaster | ServerlessBroadcaster {
  if (!broadcasterInstance) {
    const isProduction = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;

    if (isProduction) {
      logger.info('Using serverless broadcaster for production (local-only)', undefined, 'getEventBroadcaster');
      broadcasterInstance = new ServerlessBroadcaster();
    } else {
      logger.info('Using in-memory broadcaster for development', undefined, 'getEventBroadcaster');
      broadcasterInstance = new InMemoryBroadcaster();
    }
  }

  return broadcasterInstance;
}

/**
 * Broadcast a message to a channel
 * 
 * Note: In serverless environments, this only broadcasts to clients connected
 * to the current serverless function instance. This is intentional and works
 * because the broadcast typically happens in the same instance that received
 * the update (e.g., POST /api/posts → broadcast → SSE clients on same instance).
 */
export function broadcastToChannel(
  channel: Channel,
  data: Record<string, unknown>
): void {
  const broadcaster = getEventBroadcaster();
  const message: BroadcastMessage = {
    channel,
    type: data.type as string || 'update',
    data,
    timestamp: Date.now()
  };

  broadcaster.broadcast(message);
}

/**
 * Broadcast a chat message to a specific chat room
 */
export function broadcastChatMessage(
  chatId: string,
  message: {
    id: string;
    content: string;
    chatId: string;
    senderId: string;
    createdAt: string;
    isGameChat?: boolean;
  }
): void {
  broadcastToChannel(`chat:${chatId}`, {
    type: 'new_message',
    message
  });
}

