/**
 * A2A Points Transfer Handler
 * Handles reputation points transfers between users
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import { z } from 'zod'

const TransferPointsParamsSchema = z.object({
  recipientId: z.string().min(1),
  amount: z.number().int().positive(),
  message: z.string().max(200).optional(),
})

export async function handleTransferPoints(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = TransferPointsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }

    const { recipientId, amount, message } = validation.data

    // Prevent self-transfers
    if (agentId === recipientId) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: 'Cannot send points to yourself' },
        id: request.id
      }
    }

    // Verify sender and recipient exist
    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          reputationPoints: true,
          displayName: true,
          username: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: recipientId },
        select: {
          id: true,
          reputationPoints: true,
          displayName: true,
          username: true,
        },
      }),
    ])

    if (!sender) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Sender not found' },
        id: request.id
      }
    }

    if (!recipient) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: 'Recipient not found' },
        id: request.id
      }
    }

    // Check if sender has enough points
    if (sender.reputationPoints < amount) {
      return {
        jsonrpc: '2.0',
        error: {
          code: ErrorCode.INVALID_PARAMS,
          message: `Insufficient points. You have ${sender.reputationPoints} points, but tried to send ${amount} points.`,
        },
        id: request.id
      }
    }

    // Perform the transfer in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const senderPointsBefore = sender.reputationPoints
      const recipientPointsBefore = recipient.reputationPoints

      // Deduct from sender
      const updatedSender = await tx.user.update({
        where: { id: agentId },
        data: {
          reputationPoints: { decrement: amount },
        },
      })

      // Add to recipient
      const updatedRecipient = await tx.user.update({
        where: { id: recipientId },
        data: {
          reputationPoints: { increment: amount },
        },
      })

      // Create transaction record for sender (negative)
      await tx.pointsTransaction.create({
        data: {
          id: await generateSnowflakeId(),
          userId: agentId,
          amount: -amount,
          pointsBefore: senderPointsBefore,
          pointsAfter: updatedSender.reputationPoints,
          reason: 'transfer_sent',
          metadata: JSON.stringify({
            recipientId,
            recipientName: recipient.displayName || recipient.username,
            message,
          }),
        },
      })

      // Create transaction record for recipient (positive)
      await tx.pointsTransaction.create({
        data: {
          id: await generateSnowflakeId(),
          userId: recipientId,
          amount: amount,
          pointsBefore: recipientPointsBefore,
          pointsAfter: updatedRecipient.reputationPoints,
          reason: 'transfer_received',
          metadata: JSON.stringify({
            senderId: agentId,
            senderName: sender.displayName || sender.username,
            message,
          }),
        },
      })

      return {
        sender: updatedSender,
        recipient: updatedRecipient,
      }
    })

    logger.info(
      `Points transfer: ${sender.username || agentId} sent ${amount} points to ${recipient.username || recipientId}`,
      {
        agentId,
        recipientId,
        amount,
        message,
        senderNewBalance: result.sender.reputationPoints,
        recipientNewBalance: result.recipient.reputationPoints,
      },
      'A2A Points Transfer'
    )

    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        transfer: {
          amount,
          sender: {
            id: sender.id,
            name: sender.displayName || sender.username,
            newBalance: result.sender.reputationPoints,
          },
          recipient: {
            id: recipient.id,
            name: recipient.displayName || recipient.username,
            newBalance: result.recipient.reputationPoints,
          },
          message,
        },
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleTransferPoints', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to transfer points'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}


