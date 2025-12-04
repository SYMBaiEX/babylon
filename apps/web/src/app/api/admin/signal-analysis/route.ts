/**
 * Admin Signal Analysis API
 *
 * @route GET /api/admin/signal-analysis - Get signal analysis
 * @access Admin
 *
 * @description
 * Internal debugging endpoint for admins to view signal analysis. Reveals
 * secret game data and must NEVER be exposed to regular users or agents.
 * Admin authentication required.
 *
 * @openapi
 * /api/admin/signal-analysis:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get signal analysis
 *     description: Returns signal analysis data (admin only, reveals secret game data)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Signal analysis retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 signals:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * const analysis = await fetch('/api/admin/signal-analysis', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import { authenticate, withErrorHandling } from '@babylon/api';
import { asSystem } from '@babylon/db';
import { SignalExtractionService } from '@babylon/engine';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Verify admin status
  const dbUser = await asSystem(async (db) => {
    return await db.user.findUnique({
      where: { id: user.userId },
      select: { isAdmin: true },
    });
  }, 'admin-signal-analysis');

  if (!dbUser?.isAdmin) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const questionNumber = searchParams.get('questionNumber');

  if (!questionNumber) {
    return NextResponse.json(
      { error: 'questionNumber parameter required' },
      { status: 400 }
    );
  }

  // Extract signal (admin only, for debugging)
  const signal = await SignalExtractionService.extractMarketSignal(
    Number.parseInt(questionNumber, 10)
  );

  return NextResponse.json({
    success: true,
    signal,
    warning: 'This data is for admin debugging only. Never expose to agents.',
  });
});
