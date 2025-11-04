/**
 * Agent Discovery API
 *
 * Unified endpoint for discovering agents from both local registry
 * and Agent0 network.
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { getUnifiedDiscoveryService } from '@/agents/agent0/UnifiedDiscovery'
import { logger } from '@/lib/logger'
import { AgentDiscoveryQuerySchema } from '@/lib/validation/schemas'

/**
 * GET /api/agents/discover
 * Discover agents from local registry and Agent0 network
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Validate query parameters
  const { searchParams } = new URL(request.url)
  const query = {
    strategies: searchParams.get('strategies'),
    markets: searchParams.get('markets'),
    minReputation: searchParams.get('minReputation'),
    external: searchParams.get('external')
  }
  const validatedQuery = AgentDiscoveryQuerySchema.parse(query)

  const filters = {
    strategies: validatedQuery.strategies?.split(',').filter(Boolean),
    markets: validatedQuery.markets?.split(',').filter(Boolean),
    minReputation: validatedQuery.minReputation,
    includeExternal: validatedQuery.external === 'true' ||
                    process.env.AGENT0_ENABLED === 'true'
  }

  logger.info('Agent discovery request:', filters, 'AgentDiscovery')

  const discoveryService = getUnifiedDiscoveryService()
  const agents = await discoveryService.discoverAgents(filters)

  const agentsData = agents.map(agent => ({
    agentId: agent.agentId,
    tokenId: agent.tokenId,
    name: agent.name,
    address: agent.address,
    endpoint: agent.endpoint,
    capabilities: agent.capabilities,
    reputation: {
      totalBets: agent.reputation.totalBets,
      winningBets: agent.reputation.winningBets,
      accuracyScore: agent.reputation.accuracyScore,
      trustScore: agent.reputation.trustScore,
      totalVolume: agent.reputation.totalVolume,
      profitLoss: agent.reputation.profitLoss
    },
    isActive: agent.isActive
  }))

  logger.info('Agents discovered successfully', { total: agentsData.length }, 'GET /api/agents/discover')

  return successResponse({
    agents: agentsData,
    total: agentsData.length,
    filters
  })
});

