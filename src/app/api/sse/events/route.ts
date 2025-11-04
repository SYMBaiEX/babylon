/**
 * SSE Events Route
 * 
 * Server-Sent Events endpoint for real-time updates
 * Replaces WebSocket for Vercel compatibility
 * 
 * Supports multiple channels:
 * - feed: New posts and feed updates
 * - markets: Market price updates
 * - breaking-news: Breaking news events
 * - upcoming-events: New questions/events
 * - chat:{chatId}: Chat messages for specific chat
 */

import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { getEventBroadcaster, type SSEClient, type Channel } from '@/lib/sse/event-broadcaster';
import { SSEChannelsQuerySchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

// Disable buffering for SSE
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Get token from query params (EventSource doesn't support custom headers)
    const { searchParams } = new URL(request.url);
    const queryParams = {
      token: searchParams.get('token'),
      channels: searchParams.get('channels')
    };
    
    // Validate query parameters
    const validatedQuery = SSEChannelsQuerySchema.parse(queryParams);
    const token = validatedQuery.token;
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Authentication token required' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Authenticate user with token from query param
    const modifiedRequest = new NextRequest(request.url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const user = await authenticate(modifiedRequest);
    
    // Get channels from query params
    const channelsParam = validatedQuery.channels;
    const channels = channelsParam ? channelsParam.split(',') as Channel[] : ['feed'];

    logger.info(`SSE connection request from user ${user.userId} for channels: ${channels.join(', ')}`, { userId: user.userId, channels }, 'SSE');

    // Create SSE stream
    const encoder = new TextEncoder();
    const clientId = uuidv4();
    
    let pingIntervalId: NodeJS.Timeout | null = null;
    let isStreamClosed = false;

    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          // Create SSE client
          const client: SSEClient = {
            id: clientId,
            userId: user.userId,
            channels: new Set(channels),
            controller,
            lastPing: Date.now()
          };

          // Add client to broadcaster
          const broadcaster = getEventBroadcaster();
          broadcaster.addClient(client);

          // Subscribe to channels
          for (const channel of channels) {
            broadcaster.subscribeToChannel(clientId, channel);
          }

          // Send initial connection message
          try {
            controller.enqueue(
              encoder.encode(`event: connected\ndata: ${JSON.stringify({ 
                clientId, 
                channels: Array.from(client.channels),
                timestamp: Date.now() 
              })}\n\n`)
            );
          } catch (error) {
            logger.error('Error sending initial SSE message:', error, 'SSE');
            broadcaster.removeClient(clientId);
            isStreamClosed = true;
            return;
          }

          // Send periodic keep-alive pings
          pingIntervalId = setInterval(() => {
            if (isStreamClosed) {
              if (pingIntervalId) clearInterval(pingIntervalId);
              return;
            }

            try {
              controller.enqueue(
                encoder.encode(`:ping ${Date.now()}\n\n`)
              );
            } catch (error) {
              logger.debug('Ping failed, client likely disconnected', error, 'SSE');
              isStreamClosed = true;
              if (pingIntervalId) clearInterval(pingIntervalId);
              broadcaster.removeClient(clientId);
            }
          }, 15000); // Every 15 seconds

          // Cleanup on client disconnect
          request.signal.addEventListener('abort', () => {
            if (!isStreamClosed) {
              isStreamClosed = true;
              if (pingIntervalId) clearInterval(pingIntervalId);
              broadcaster.removeClient(clientId);
              logger.info(`SSE client disconnected (abort signal): ${clientId}`, { clientId, userId: user.userId }, 'SSE');
            }
          });
        } catch (error) {
          logger.error('Error in SSE stream start:', error, 'SSE');
          if (pingIntervalId) clearInterval(pingIntervalId);
          const broadcaster = getEventBroadcaster();
          broadcaster.removeClient(clientId);
          isStreamClosed = true;
          try {
            controller.error(error);
          } catch {
            // Controller already closed
          }
        }
      },
      
      cancel() {
        // Called when the client closes the connection
        if (!isStreamClosed) {
          isStreamClosed = true;
          if (pingIntervalId) clearInterval(pingIntervalId);
          const broadcaster = getEventBroadcaster();
          broadcaster.removeClient(clientId);
          logger.info(`SSE client disconnected (cancel): ${clientId}`, { clientId }, 'SSE');
        }
      }
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  } catch (error) {
    logger.error('SSE connection error:', error, 'SSE');
    
    if (error instanceof Error && error.message === 'Authentication failed') {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Failed to establish SSE connection' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

