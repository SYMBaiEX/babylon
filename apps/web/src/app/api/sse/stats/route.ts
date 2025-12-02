/**
 * SSE Stats API
 *
 * @route GET /api/sse/stats - Get SSE connection statistics
 * @access Public
 *
 * @description
 * Returns statistics about connected Server-Sent Events (SSE) clients including
 * total connections, channels, and connection details. Useful for debugging and
 * monitoring real-time features.
 *
 * @openapi
 * /api/sse/stats:
 *   get:
 *     tags:
 *       - SSE
 *     summary: Get SSE connection statistics
 *     description: Returns statistics about connected SSE clients
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalClients:
 *                       type: integer
 *                     channels:
 *                       type: object
 *                 timestamp:
 *                   type: integer
 *
 * @example
 * ```typescript
 * const { stats } = await fetch('/api/sse/stats')
 *   .then(r => r.json());
 * console.log(`Total SSE clients: ${stats.totalClients}`);
 * ```
 *
 * @see {@link /lib/sse/event-broadcaster} Event broadcaster
 */

import type { NextRequest } from 'next/server';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { connections } from '@babylon/api';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (_request: NextRequest) => {
  const stats = connections.snapshot();

  logger.info(
    'SSE stats fetched successfully',
    { totalClients: stats.totalConnections },
    'GET /api/sse/stats'
  );

  return successResponse({
    success: true,
    stats,
    timestamp: Date.now(),
  });
});
