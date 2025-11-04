/**
 * Agent Metadata API
 *
 * Retrieve agent metadata from IPFS by agent ID.
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { NotFoundError, InternalServerError, BusinessLogicError } from '@/lib/errors'
import { AgentIdParamSchema } from '@/lib/validation/schemas'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'
import { IPFSPublisher } from '@/agents/agent0/IPFSPublisher'

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
      agent0MetadataCID: true,
      nftTokenId: true
    }
  })

  if (!user?.agent0MetadataCID) {
    throw new NotFoundError('Agent metadata', agentId)
  }

  // Fetch metadata from IPFS
  const ipfsPublisher = new IPFSPublisher()
  let metadata
  try {
    metadata = await ipfsPublisher.fetchMetadata(user.agent0MetadataCID)
  } catch (error) {
    logger.error(`Failed to fetch metadata from IPFS for agent ${agentId}:`, error, 'AgentMetadata')
    if (error instanceof Error && error.message.includes('not found')) {
      throw new NotFoundError('Metadata', user.agent0MetadataCID)
    }
    throw new InternalServerError('Failed to retrieve metadata from IPFS', { agentId, cid: user.agent0MetadataCID })
  }

  // Add Babylon-specific fields
  const response = {
    ...metadata,
    babylon: {
      agentId: user.id,
      tokenId: user.nftTokenId,
      username: user.username,
      displayName: user.displayName
    },
    ipfsGatewayUrl: ipfsPublisher.getGatewayUrl(user.agent0MetadataCID)
  }

  logger.info('Agent metadata retrieved successfully', { agentId, cid: user.agent0MetadataCID }, 'GET /api/agents/metadata/[agentId]')

  return successResponse(response)
})

