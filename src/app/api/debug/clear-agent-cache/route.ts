/**
 * Clear Agent Runtime Cache API
 * 
 * @route POST /api/debug/clear-agent-cache - Clear agent cache
 * @access Admin/Debug
 * 
 * @description
 * Debug endpoint to forcefully clear all cached agent runtimes from memory.
 * Useful for troubleshooting agent behavior issues, memory leaks, or forcing
 * runtime reinitialization after configuration changes. Clears ALL agent
 * runtimes, causing temporary performance impact.
 * 
 * @openapi
 * /api/debug/clear-agent-cache:
 *   post:
 *     tags:
 *       - Debug
 *     summary: Clear agent cache
 *     description: Clears all cached agent runtimes (admin/debug only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 cleared:
 *                   type: integer
 *                   description: Number of runtimes cleared
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin/debug access required
 * 
 * @example
 * ```typescript
 * await fetch('/api/debug/clear-agent-cache', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * });
 * ```
 * @returns {object} Success response with count of cleared runtimes
 * @property {boolean} success - Operation success status
 * @property {number} cleared - Number of runtime instances cleared
 * 
 * @throws {500} Internal server error if cache clearing fails
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/debug/clear-agent-cache', {
 *   method: 'POST'
 * });
 * const data = await response.json();
 * // { success: true, cleared: 15 }
 * ```
 * 
 * @see {@link /lib/agents/runtime/AgentRuntimeManager} Runtime manager implementation
 */

import { NextResponse } from 'next/server'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { logger } from '@/lib/logger'

export async function POST() {
  const count = agentRuntimeManager.getRuntimeCount()
  agentRuntimeManager.clearAllRuntimes()
  logger.info(`Cleared ${count} cached runtimes`, undefined, 'Debug')
  return NextResponse.json({ success: true, cleared: count })
}

