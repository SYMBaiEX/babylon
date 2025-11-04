/**
 * Agent Metadata API
 *
 * Retrieve agent metadata from IPFS by agent ID.
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { NotFoundError, BusinessLogicError } from '@/lib/errors'
import { AgentIdParamSchema } from '@/lib/validation/schemas'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'

export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ agentId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')))
  const { agentId } = AgentIdParamSchema.parse(params)

  logger.debug('Metadata request received', { url: request.url }, 'AgentMetadata')

  // Check if it's a user/agent ID or token ID
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: agentId },
        { username: agentId },
        { nftTokenId: parseInt(agentId, 10) || undefined }
      ]
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      nftTokenId: true,
      onChainRegistered: true,
      bio: true,
      profileImageUrl: true
    }
  })

  if (!user?.nftTokenId) {
    throw new NotFoundError('Agent not registered on-chain', agentId)
  }

  // For now, return basic agent metadata from database
  // TODO: When Agent0 metadata is stored, fetch from IPFS using stored CID
  const response = {
    name: user.displayName || user.username || 'Unknown Agent',
    description: user.bio || '',
    image: user.profileImageUrl || '',
    babylon: {
      agentId: user.id,
      tokenId: user.nftTokenId,
      username: user.username,
      displayName: user.displayName,
      onChainRegistered: user.onChainRegistered
    }
  }

  logger.info('Agent metadata retrieved successfully', { agentId, tokenId: user.nftTokenId }, 'GET /api/agents/metadata/[agentId]')

  return successResponse(response)
})

