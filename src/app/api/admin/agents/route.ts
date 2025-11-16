/**
 * Admin Agents Management API
 * 
 * @route GET /api/admin/agents - Get all agents
 * @access Admin
 * 
 * @description
 * Returns list of all autonomous agents with configuration, performance metrics,
 * status, and timing information. Requires admin authentication.
 * 
 * @openapi
 * /api/admin/agents:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get all agents
 *     description: Returns list of all autonomous agents with stats (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Agents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       agentSystem:
 *                         type: string
 *                       agentModelTier:
 *                         type: string
 *                       agentPointsBalance:
 *                         type: number
 *                       autonomousTrading:
 *                         type: boolean
 *                       autonomousPosting:
 *                         type: boolean
 *                       agentStatus:
 *                         type: string
 *                       lifetimePnL:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/admin/agents', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * });
 * ```
 * 
 * @see {@link /lib/api/admin-middleware} Admin middleware
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/agents
 * Returns all autonomous agents with stats
 */
export async function GET(_req: NextRequest) {
  try {
    // Get all agents
    const agents = await prisma.user.findMany({
      where: {
        isAgent: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        
        // Agent config
        agentSystem: true,
        agentModelTier: true,
        agentPointsBalance: true,
        
        // Autonomous flags
        autonomousTrading: true,
        autonomousPosting: true,
        autonomousCommenting: true,
        autonomousDMs: true,
        autonomousGroupChats: true,
        
        // Performance
        lifetimePnL: true,
        
        // Status
        agentStatus: true,
        agentErrorMessage: true,
        agentLastTickAt: true,
        agentLastChatAt: true,
        
        // Timing
        createdAt: true,
        updatedAt: true,
        
        // Creator
        managedBy: true,

        // Performance metrics relation
        AgentPerformanceMetrics: {
          select: {
            totalTrades: true,
            profitableTrades: true,
            reputationScore: true,
            averageFeedbackScore: true,
            totalFeedbackCount: true,
          },
        },
      },
      orderBy: {
        agentLastTickAt: 'desc',
      },
    });

    // Get creator names
    const creatorIds = agents.map(a => a.managedBy).filter(Boolean) as string[];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, displayName: true, username: true },
    });
    const creatorMap = new Map(creators.map(c => [c.id, c.displayName || c.username]));

    // Get recent logs count for each agent (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logCounts = await prisma.agentLog.groupBy({
      by: ['agentUserId'],
      where: {
        createdAt: { gte: oneDayAgo },
      },
      _count: true,
    });
    const logCountMap = new Map(logCounts.map(l => [l.agentUserId, l._count]));

    // Get error counts
    const errorCounts = await prisma.agentLog.groupBy({
      by: ['agentUserId'],
      where: {
        createdAt: { gte: oneDayAgo },
        level: 'error',
      },
      _count: true,
    });
    const errorCountMap = new Map(errorCounts.map(e => [e.agentUserId, e._count]));

    // Format agents
    const formattedAgents = agents.map(agent => {
      const totalTrades = agent.AgentPerformanceMetrics?.totalTrades ?? 0;
      const profitableTrades = agent.AgentPerformanceMetrics?.profitableTrades ?? 0;
      const autonomousEnabled = 
        agent.autonomousTrading ||
        agent.autonomousPosting ||
        agent.autonomousCommenting ||
        agent.autonomousDMs ||
        agent.autonomousGroupChats;

      const winRate = totalTrades > 0
        ? profitableTrades / totalTrades
        : 0;

      return {
        id: agent.id,
        name: agent.username || '',
        displayName: agent.displayName || agent.username || '',
        description: agent.bio || null,
        profileImageUrl: agent.profileImageUrl || null,
        creatorId: agent.managedBy || 'system',
        creatorName: agent.managedBy ? creatorMap.get(agent.managedBy) || null : 'System',
        modelTier: agent.agentModelTier || 'lite',
        pointsBalance: agent.agentPointsBalance || 0,
        
        // Autonomous status
        autonomousEnabled,
        autonomousTrading: agent.autonomousTrading || false,
        autonomousPosting: agent.autonomousPosting || false,
        autonomousCommenting: agent.autonomousCommenting || false,
        autonomousDMs: agent.autonomousDMs || false,
        autonomousGroupChats: agent.autonomousGroupChats || false,
        
        // Performance
        lifetimePnL: Number(agent.lifetimePnL || 0),
        totalTrades,
        winRate,
        reputationScore: agent.AgentPerformanceMetrics?.reputationScore ?? 50,
        averageFeedbackScore: agent.AgentPerformanceMetrics?.averageFeedbackScore ?? 0,
        totalFeedbackCount: agent.AgentPerformanceMetrics?.totalFeedbackCount ?? 0,
        
        // Status
        agentStatus: agent.agentStatus,
        errorMessage: agent.agentErrorMessage,
        lastTickAt: agent.agentLastTickAt,
        lastChatAt: agent.agentLastChatAt,
        
        // Timing
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        
        // Recent activity
        recentLogsCount: logCountMap.get(agent.id) || 0,
        recentErrorsCount: errorCountMap.get(agent.id) || 0,
      };
    });

    // Calculate stats
    const stats = {
      total: formattedAgents.length,
      running: formattedAgents.filter(a => a.autonomousEnabled && a.agentStatus === 'running').length,
      paused: formattedAgents.filter(a => !a.autonomousEnabled || a.agentStatus === 'paused').length,
      error: formattedAgents.filter(a => a.agentStatus === 'error' || a.recentErrorsCount > 0).length,
      totalActions24h: Array.from(logCountMap.values()).reduce((sum, count) => sum + count, 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        agents: formattedAgents,
        stats,
      },
    });
  } catch (error) {
    logger.error('Failed to get agents', { error }, 'AdminAgentsAPI');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get agents',
      },
      { status: 500 }
    );
  }
}


