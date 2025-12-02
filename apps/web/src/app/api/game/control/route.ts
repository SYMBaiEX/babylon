/**
 * Game Control API
 *
 * @route GET /api/game/control - Get game state
 * @route POST /api/game/control - Start/pause game
 * @access GET: Public
 * @access POST: Admin (ADMIN_TOKEN or dev)
 *
 * @description
 * Controls the main continuous game engine. GET returns current game state.
 * POST starts or pauses the game (admin only).
 *
 * @openapi
 * /api/game/control:
 *   get:
 *     tags:
 *       - Game
 *     summary: Get game state
 *     description: Returns current game state (public)
 *     responses:
 *       200:
 *         description: Game state retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 game:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                     isRunning:
 *                       type: boolean
 *                     currentDay:
 *                       type: integer
 *   post:
 *     tags:
 *       - Game
 *     summary: Start/pause game
 *     description: Controls game engine (admin only, requires ADMIN_TOKEN)
 *     security:
 *       - CronSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [start, pause]
 *     responses:
 *       200:
 *         description: Game control action completed successfully
 *       401:
 *         description: Unauthorized (admin token required)
 *
 * @example
 * ```typescript
 * // Get state
 * const { game } = await fetch('/api/game/control').then(r => r.json());
 *
 * // Control game
 * await fetch('/api/game/control', {
 *   method: 'POST',
 *   headers: { 'x-admin-token': adminToken },
 *   body: JSON.stringify({ action: 'start' })
 * });
 * ```
 * @property {string} pausedAt - When game was paused (ISO)
 * @property {string} lastTickAt - Last game tick timestamp (ISO)
 * @property {number} activeQuestions - Number of active questions
 *
 * @throws {400} Invalid action (POST)
 * @throws {401} Unauthorized - admin token required (POST)
 * @throws {500} Internal server error
 *
 * @example
 * ```typescript
 * // Start the game (admin only)
 * const response = await fetch('/api/game/control', {
 *   method: 'POST',
 *   headers: {
 *     'x-admin-token': process.env.ADMIN_TOKEN
 *   },
 *   body: JSON.stringify({ action: 'start' })
 * });
 *
 * // Pause the game (admin only)
 * await fetch('/api/game/control', {
 *   method: 'POST',
 *   headers: { 'x-admin-token': process.env.ADMIN_TOKEN },
 *   body: JSON.stringify({ action: 'pause' })
 * });
 *
 * // Get current game state (public)
 * const state = await fetch('/api/game/control');
 * const { game } = await state.json();
 * console.log(`Game is ${game.isRunning ? 'running' : 'paused'}`);
 * console.log(`Current day: ${game.currentDay}`);
 * ```
 *
 * **Admin Authentication:**
 * ```typescript
 * // Set in environment
 * ADMIN_TOKEN=your-secret-token
 *
 * // Use in requests
 * headers: { 'x-admin-token': process.env.ADMIN_TOKEN }
 * ```
 *
 * @see {@link /lib/game-service} Game engine implementation
 * @see {@link /lib/serverless-game-tick} Game tick logic
 * @see {@link /api/cron/game-tick} Game tick cron job
 */

import type { NextRequest } from 'next/server';
import { asSystem } from '@babylon/db';
import { AuthorizationError, BadRequestError } from '@babylon/api';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { generateSnowflakeId } from '@babylon/shared';

interface ControlRequest {
  action: 'start' | 'pause';
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Check for admin authorization
  const adminToken = request.headers.get('x-admin-token');
  const hasAdminSecret = !!process.env.ADMIN_TOKEN;
  const isAdmin = hasAdminSecret && adminToken === process.env.ADMIN_TOKEN;
  const isDev = process.env.NODE_ENV === 'development';

  if (!isAdmin && !isDev) {
    throw new AuthorizationError(
      'Admin authorization required',
      'game',
      'control'
    );
  }

  const body = (await request.json()) as ControlRequest;
  const { action } = body;

  if (!action || !['start', 'pause'].includes(action)) {
    throw new BadRequestError('Action must be "start" or "pause"');
  }

  // Get or create the continuous game - system operation (admin)
  const game = await asSystem(async (db) => {
    let gameState = await db.game.findFirst({
      where: { isContinuous: true },
    });

    if (!gameState) {
      // Create the game if it doesn't exist
      const now = new Date();
      gameState = await db.game.create({
        data: {
          id: await generateSnowflakeId(),
          isContinuous: true,
          isRunning: action === 'start',
          currentDay: 1,
          startedAt: action === 'start' ? now : null,
          createdAt: now,
          updatedAt: now,
        },
      });
      logger.info(
        `Game created and ${action === 'start' ? 'started' : 'paused'}`,
        { gameId: gameState.id },
        'Game Control'
      );
    } else {
      // Update the existing game
      const isRunning = action === 'start';
      const updateData: {
        isRunning: boolean;
        startedAt?: Date;
        pausedAt?: Date;
      } = {
        isRunning,
      };

      if (action === 'start') {
        updateData.startedAt = gameState.startedAt || new Date();
        updateData.pausedAt = undefined;
      } else {
        updateData.pausedAt = new Date();
      }

      gameState = await db.game.update({
        where: { id: gameState.id },
        data: updateData,
      });

      logger.info(
        `Game ${action === 'start' ? 'started' : 'paused'}`,
        {
          gameId: gameState.id,
          isRunning: gameState.isRunning,
          currentDay: gameState.currentDay,
        },
        'Game Control'
      );
    }

    return gameState;
  });

  return successResponse({
    success: true,
    action,
    game: {
      id: game.id,
      isRunning: game.isRunning,
      currentDay: game.currentDay,
      currentDate: game.currentDate.toISOString(),
      lastTickAt: game.lastTickAt?.toISOString(),
    },
  });
});

/**
 * GET /api/game/control - Get current game state
 */
export const GET = withErrorHandling(async (_request: NextRequest) => {
  const game = await asSystem(async (db) => {
    return await db.game.findFirst({
      where: { isContinuous: true },
    });
  });

  if (!game) {
    return successResponse({
      success: true,
      game: null,
      message: 'No game found. Use POST to create and start a game.',
    });
  }

  return successResponse({
    success: true,
    game: {
      id: game.id,
      isRunning: game.isRunning,
      isContinuous: game.isContinuous,
      currentDay: game.currentDay,
      currentDate: game.currentDate.toISOString(),
      speed: game.speed,
      startedAt: game.startedAt?.toISOString(),
      pausedAt: game.pausedAt?.toISOString(),
      lastTickAt: game.lastTickAt?.toISOString(),
      activeQuestions: game.activeQuestions,
    },
  });
});
