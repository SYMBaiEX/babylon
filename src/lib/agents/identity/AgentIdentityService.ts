/**
 * Agent Identity Service
 * 
 * Handles:
 * 1. Privy embedded wallet creation for agent users
 * 2. Agent0 network registration (ERC-8004)
 * 3. On-chain identity verification
 * 
 * IMPORTANT: Agents are Users (isAgent=true)
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import type { User } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

export class AgentIdentityService {
  /**
   * Create embedded wallet for agent user via Privy
   */
  async createAgentWallet(agentUserId: string): Promise<{
    walletAddress: string
    privyWalletId: string
  }> {
    try {
      logger.info(`Creating wallet for agent user ${agentUserId}`, undefined, 'AgentIdentityService')

      const agentUser = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agentUser || !agentUser.isAgent) {
        throw new Error('Agent user not found')
      }

      // Generate deterministic wallet address (placeholder for real Privy integration)
      const walletAddress = `0x${Buffer.from(agentUserId.slice(0, 40)).toString('hex').padEnd(40, '0')}`
      const privyWalletId = `wallet_${uuidv4()}`

      await prisma.user.update({
        where: { id: agentUserId },
        data: { walletAddress, privyId: privyWalletId }
      })

      await prisma.agentLog.create({
        data: {
          id: uuidv4(),
          agentUserId,
          type: 'system',
          level: 'info',
          message: `Wallet created: ${walletAddress}`,
          metadata: { privyWalletId }
        }
      })

      logger.info(`Wallet created for agent ${agentUserId}: ${walletAddress}`, undefined, 'AgentIdentityService')
      return { walletAddress, privyWalletId }
    } catch (error: unknown) {
      logger.error(`Failed to create wallet for agent ${agentUserId}`, error, 'AgentIdentityService')
      throw error
    }
  }

  /**
   * Register agent user on Agent0 network
   */
  async registerOnAgent0(agentUserId: string): Promise<{
    agent0TokenId: number
    metadataCID?: string
    txHash?: string
  }> {
    try {
      logger.info(`Registering agent user ${agentUserId} on Agent0`, undefined, 'AgentIdentityService')

      const agentUser = await prisma.user.findUnique({ where: { id: agentUserId } })
      if (!agentUser || !agentUser.isAgent) throw new Error('Agent user not found')
      if (!agentUser.walletAddress) throw new Error('Agent must have wallet before Agent0 registration')

      const agent0Client = getAgent0Client()
      const capabilities = {
        strategies: agentUser.agentTradingStrategy 
          ? ['autonomous-trading', 'prediction-markets', 'social-interaction']
          : ['chat', 'analysis'],
        markets: ['prediction', 'perp', 'crypto'],
        actions: ['trade', 'analyze', 'chat', 'post', 'comment'],
        version: '1.0.0',
        platform: 'babylon',
        userType: 'agent',
        x402Support: false,
        autonomousTrading: agentUser.autonomousTrading,
        autonomousPosting: agentUser.autonomousPosting,
      }

      const registration = await agent0Client.registerAgent({
        name: agentUser.displayName || agentUser.username || 'Agent',
        description: agentUser.bio || `Autonomous AI agent in Babylon`,
        imageUrl: agentUser.profileImageUrl || undefined,
        walletAddress: agentUser.walletAddress!,
        a2aEndpoint: process.env.NEXT_PUBLIC_APP_URL 
          ? `${process.env.NEXT_PUBLIC_APP_URL}/a2a`
          : undefined,
        capabilities
      })

      await prisma.user.update({
        where: { id: agentUserId },
        data: {
          agent0TokenId: registration.tokenId,
          agent0MetadataCID: registration.metadataCID,
          registrationTxHash: registration.txHash,
          onChainRegistered: true
        }
      })

      await prisma.agentLog.create({
        data: {
          id: uuidv4(),
          agentUserId,
          type: 'system',
          level: 'info',
          message: `Agent registered on Agent0: Token ID ${registration.tokenId}`,
          metadata: { tokenId: registration.tokenId, metadataCID: registration.metadataCID, txHash: registration.txHash }
        }
      })

      logger.info(`Agent ${agentUserId} registered on Agent0: Token ID ${registration.tokenId}`, undefined, 'AgentIdentityService')
      return { agent0TokenId: registration.tokenId, metadataCID: registration.metadataCID, txHash: registration.txHash }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to register agent ${agentUserId} on Agent0`, error, 'AgentIdentityService')
      await prisma.agentLog.create({
        data: {
          id: uuidv4(),
          agentUserId,
          type: 'error',
          level: 'error',
          message: `Agent0 registration failed: ${errorMessage}`,
          metadata: { error: errorMessage }
        }
      })
      throw error
    }
  }

  async setupAgentIdentity(agentUserId: string): Promise<User> {
    logger.info(`Setting up identity for agent user ${agentUserId}`, undefined, 'AgentIdentityService')

    await this.createAgentWallet(agentUserId)

    try {
      await this.registerOnAgent0(agentUserId)
    } catch (error) {
      logger.warn(`Agent0 registration failed for ${agentUserId}, but wallet created`, error, 'AgentIdentityService')
    }

    const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
    return agent!
  }

  async verifyAgentIdentity(agentUserId: string): Promise<boolean> {
    const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
    if (!agent || !agent.isAgent || !agent.agent0TokenId) return false

    try {
      const agent0Client = getAgent0Client()
      const profile = await agent0Client.getAgentProfile(agent.agent0TokenId)
      return profile !== null
    } catch (error) {
      logger.error(`Failed to verify agent identity for ${agentUserId}`, error, 'AgentIdentityService')
      return false
    }
  }
}

export const agentIdentityService = new AgentIdentityService()

