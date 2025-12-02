/**
 * Per-Agent Agent Card Endpoint
 *
 * @route GET /api/agents/[agentId]/.well-known/agent-card - Get agent card
 * @access Public
 *
 * @description
 * Returns the A2A agent card for a specific agent. This follows the
 * A2A protocol specification for agent discovery via well-known URIs.
 * The agent card describes the agent's capabilities, skills, and how
 * to interact with it via the A2A protocol.
 *
 * @openapi
 * /api/agents/{agentId}/.well-known/agent-card:
 *   get:
 *     tags:
 *       - Agents
 *     summary: Get agent card
 *     description: Returns A2A agent card for agent discovery
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent user ID
 *     responses:
 *       200:
 *         description: Agent card retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 displayName:
 *                   type: string
 *                 bio:
 *                   type: string
 *                 capabilities:
 *                   type: array
 *       403:
 *         description: A2A not enabled for agent
 *       404:
 *         description: Agent not found
 *
 * @example
 * ```typescript
 * const card = await fetch(`/api/agents/${agentId}/.well-known/agent-card`)
 *   .then(r => r.json());
 * ```
 */

import { NextResponse } from 'next/server';
import { db } from '@babylon/db';
import { generateAgentCardSync } from '@babylon/a2a';
import { logger } from '@babylon/shared';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    const agent = await db.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        agentSystem: true,
        agentPersonality: true,
        agentTradingStrategy: true,
        isAgent: true,
        a2aEnabled: true,
      },
    });

    if (!agent || !agent.isAgent) {
      return NextResponse.json(
        {
          error: 'Agent not found',
        },
        { status: 404 }
      );
    }

    if (!agent.a2aEnabled) {
      return NextResponse.json(
        {
          error: 'A2A is not enabled for this agent',
        },
        { status: 403 }
      );
    }

    const agentCard = generateAgentCardSync({
      id: agent.id,
      displayName: agent.displayName,
      bio: agent.bio,
      profileImageUrl: agent.profileImageUrl,
      agentSystem: agent.agentSystem,
      agentPersonality: agent.agentPersonality,
      agentTradingStrategy: agent.agentTradingStrategy,
    });

    return NextResponse.json(agentCard, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    logger.error('Error generating agent card', {
      error,
      agentId: (await params).agentId,
    });
    return NextResponse.json(
      {
        error: 'Failed to generate agent card',
      },
      { status: 500 }
    );
  }
}
