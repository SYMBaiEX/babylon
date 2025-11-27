/**
 * Health Check Cron Job API
 *
 * @route GET /api/cron/health-check - System health check
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Simple health check endpoint that runs every 15 minutes to keep serverless
 * functions warm, verify database connectivity, and log system health metrics.
 * Max execution time: 60s.
 *
 * @openapi
 * /api/cron/health-check:
 *   get:
 *     tags:
 *       - Cron
 *     summary: System health check
 *     description: Verifies database connectivity and system health (requires CRON_SECRET)
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: System healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy]
 *                 database:
 *                   type: string
 *                   enum: [connected, error]
 *                 duration:
 *                   type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Invalid or missing CRON_SECRET
 *       500:
 *         description: System unhealthy
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/cron/health-check', {
 *   headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
 * });
 * const { status, database } = await response.json();
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { logger } from '@/lib/logger';

// Vercel function configuration
export const maxDuration = 60; // 1 minute max for health check
export const dynamic = 'force-dynamic';

// Verify this is a legitimate Vercel Cron request
function verifyVercelCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without secret for easy testing
  if (process.env.NODE_ENV === 'development') {
    if (!cronSecret) {
      return true;
    }
  }

  if (!cronSecret) {
    logger.error('CRON_SECRET not configured', undefined, 'HealthCheck');
    return false;
  }

  const expectedAuth = `Bearer ${cronSecret}`;
  return authHeader === expectedAuth;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron authorization
  if (!verifyVercelCronRequest(request)) {
    logger.warn('Unauthorized health check attempt', undefined, 'HealthCheck');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Quick database health check
    await db.$queryRaw`SELECT 1`;

    const duration = Date.now() - startTime;

    logger.info(
      'Health check passed',
      {
        duration,
        timestamp: new Date().toISOString(),
      },
      'HealthCheck'
    );

    return NextResponse.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Health check failed', error, 'HealthCheck');

    return NextResponse.json(
      {
        success: false,
        status: 'unhealthy',
        database: 'error',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
