/**
 * Agent Detail API Routes
 * 
 * GET    /api/agents/[agentId] - Get agent details
 * PUT    /api/agents/[agentId] - Update agent
 * DELETE /api/agents/[agentId] - Delete agent
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { agentService } from '@/lib/agents/services/AgentService'
import { logger } from '@/lib/logger'
import { authenticateUser } from '@/lib/server-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params

    const agent = await agentService.getAgent(agentId, user.id)
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        username: agent.username,
        name: agent.displayName,
        description: agent.bio,
        profileImageUrl: agent.profileImageUrl,
        system: agent.agentSystem,
        personality: agent.agentPersonality,
        tradingStrategy: agent.agentTradingStrategy,
        pointsBalance: agent.agentPointsBalance,
        totalDeposited: agent.agentTotalDeposited,
        totalWithdrawn: agent.agentTotalWithdrawn,
        totalPointsSpent: agent.agentTotalPointsSpent,
        autonomousTrading: agent.autonomousTrading,
        autonomousPosting: agent.autonomousPosting,
        autonomousCommenting: agent.autonomousCommenting,
        autonomousDMs: agent.autonomousDMs,
        autonomousGroupChats: agent.autonomousGroupChats,
        modelTier: agent.agentModelTier,
        status: agent.agentStatus,
        errorMessage: agent.agentErrorMessage,
        lifetimePnL: agent.lifetimePnL.toString(),
        lastTickAt: agent.agentLastTickAt?.toISOString(),
        lastChatAt: agent.agentLastChatAt?.toISOString(),
        walletAddress: agent.walletAddress,
        agent0TokenId: agent.agent0TokenId,
        onChainRegistered: agent.onChainRegistered,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString()
      }
    })
  } catch (error: unknown) {
    logger.error('Error getting agent', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get agent' },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params
    const body = await req.json()

    const { name, description, profileImageUrl, system, bio, personality, tradingStrategy, modelTier, isActive, autonomousEnabled } = body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl
    if (system !== undefined) updates.system = system
    if (bio !== undefined) updates.bio = bio
    if (personality !== undefined) updates.personality = personality
    if (tradingStrategy !== undefined) updates.tradingStrategy = tradingStrategy
    if (modelTier !== undefined) updates.modelTier = modelTier
    if (isActive !== undefined) updates.isActive = isActive
    if (autonomousEnabled !== undefined) updates.autonomousEnabled = autonomousEnabled

    const agent = await agentService.updateAgent(agentId, user.id, updates)

    logger.info(`Agent updated via API: ${agentId}`, undefined, 'AgentsAPI')

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        username: agent.username,
        name: agent.displayName,
        description: agent.bio,
        profileImageUrl: agent.profileImageUrl,
        pointsBalance: agent.agentPointsBalance,
        autonomousTrading: agent.autonomousTrading,
        autonomousPosting: agent.autonomousPosting,
        modelTier: agent.agentModelTier,
        updatedAt: agent.updatedAt.toISOString()
      }
    })
  } catch (error: unknown) {
    logger.error('Error updating agent', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update agent' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params

    await agentService.deleteAgent(agentId, user.id)

    logger.info(`Agent deleted via API: ${agentId}`, undefined, 'AgentsAPI')

    return NextResponse.json({
      success: true,
      message: 'Agent deleted successfully'
    })
  } catch (error: unknown) {
    logger.error('Error deleting agent', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete agent' },
      { status: 500 }
    )
  }
}

