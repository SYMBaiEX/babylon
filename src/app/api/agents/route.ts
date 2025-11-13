/**
 * Agents API Routes v2 - Agents are Users
 * 
 * POST /api/agents - Create new agent (creates User with isAgent=true)
 * GET  /api/agents - List user's managed agents
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { agentService } from '@/lib/agents/services/AgentService'
import { logger } from '@/lib/logger'
import { authenticateUser } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req)
    
    const body = await req.json()
    const { name, description, profileImageUrl, system, bio, personality, tradingStrategy, initialDeposit, modelTier } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!system || typeof system !== 'string') {
      return NextResponse.json({ error: 'System prompt is required' }, { status: 400 })
    }

    // Create agent (as a User with isAgent=true)
    const agentUser = await agentService.createAgent({
      userId: user.id,
      name,
      description,
      profileImageUrl,
      system,
      bio,
      personality,
      tradingStrategy,
      initialDeposit: initialDeposit || 0,
      modelTier: modelTier || 'free'
    })

    logger.info(`Agent user created via API: ${agentUser.id}`, undefined, 'AgentsAPI')

    return NextResponse.json({
      success: true,
      agent: {
        id: agentUser.id,
        username: agentUser.username,
        name: agentUser.displayName,
        description: agentUser.bio,
        profileImageUrl: agentUser.profileImageUrl,
        pointsBalance: agentUser.agentPointsBalance,
        autonomousTrading: agentUser.autonomousTrading,
        autonomousPosting: agentUser.autonomousPosting,
        autonomousCommenting: agentUser.autonomousCommenting,
        autonomousDMs: agentUser.autonomousDMs,
        autonomousGroupChats: agentUser.autonomousGroupChats,
        modelTier: agentUser.agentModelTier,
        lifetimePnL: agentUser.lifetimePnL.toString(),
        walletAddress: agentUser.walletAddress,
        onChainRegistered: agentUser.onChainRegistered,
        createdAt: agentUser.createdAt.toISOString()
      }
    })
  } catch (error: unknown) {
    logger.error('Error creating agent', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create agent' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req)
    
    const { searchParams } = new URL(req.url)
    const autonomousTrading = searchParams.get('autonomousTrading')

    const filters: { autonomousTrading?: boolean } = {}
    if (autonomousTrading !== null) {
      filters.autonomousTrading = autonomousTrading === 'true'
    }

    // Get user's managed agents
    const agents = await agentService.listUserAgents(user.id, filters)

    return NextResponse.json({
      success: true,
      agents: agents.map(agent => ({
        id: agent.id,
        username: agent.username,
        name: agent.displayName,
        description: agent.bio,
        profileImageUrl: agent.profileImageUrl,
        pointsBalance: agent.agentPointsBalance,
        autonomousTrading: agent.autonomousTrading,
        autonomousPosting: agent.autonomousPosting,
        autonomousCommenting: agent.autonomousCommenting,
        autonomousDMs: agent.autonomousDMs,
        autonomousGroupChats: agent.autonomousGroupChats,
        modelTier: agent.agentModelTier,
        status: agent.agentStatus,
        lifetimePnL: agent.lifetimePnL.toString(),
        totalTrades: 0, // Calculate from AgentTrade
        winRate: 0,
        lastTickAt: agent.agentLastTickAt?.toISOString(),
        lastChatAt: agent.agentLastChatAt?.toISOString(),
        createdAt: agent.createdAt.toISOString()
      }))
    })
  } catch (error: unknown) {
    logger.error('Error listing agents', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list agents' },
      { status: 500 }
    )
  }
}

