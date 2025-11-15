/**
 * A2A Notification Handlers
 * Handlers for notifications and group invites
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { logger } from '@/lib/logger'
import {
  GetNotificationsParamsSchema,
  MarkNotificationsReadParamsSchema,
  AcceptGroupInviteParamsSchema,
  DeclineGroupInviteParamsSchema,
} from '../validation'

export async function handleGetNotifications(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetNotificationsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { limit } = validation.data
    const userId = agentId
    
    const notifications = await prisma.notification.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' }
    })
    
    const unreadCount = await prisma.notification.count({
      where: { userId, read: false }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        notifications: notifications.map(n => ({
          id: n.id,
          type: n.type,
          message: n.message,
          read: n.read,
          createdAt: n.createdAt
        })),
        unreadCount
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetNotifications', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch notifications' },
      id: request.id
    }
  }
}

export async function handleMarkNotificationsRead(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = MarkNotificationsReadParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { notificationIds } = validation.data
    const userId = agentId
    
    await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId
      },
      data: { read: true }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleMarkNotificationsRead', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to mark notifications read' },
      id: request.id
    }
  }
}

export async function handleGetGroupInvites(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const userId = agentId
    
    const invites = await prisma.userGroupInvite.findMany({
      where: {
        invitedUserId: userId,
        status: 'pending'
      }
    })
    
    // Fetch group details separately
    const groupIds = invites.map(inv => inv.groupId)
    const groups = await prisma.userGroup.findMany({
      where: {
        id: { in: groupIds }
      },
      select: {
        id: true,
        name: true,
        description: true
      }
    })
    
    const groupsMap = new Map(groups.map(g => [g.id, g]))
    
    return {
      jsonrpc: '2.0',
      result: {
        invites: invites.map(i => {
          const group = groupsMap.get(i.groupId)
          return {
            inviteId: i.id,
            groupId: i.groupId,
            groupName: group?.name || 'Unknown Group',
            invitedAt: i.invitedAt
          }
        })
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetGroupInvites', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch group invites' },
      id: request.id
    }
  }
}

export async function handleAcceptGroupInvite(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = AcceptGroupInviteParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { inviteId } = validation.data
    const userId = agentId
    
    const invite = await prisma.userGroupInvite.findUnique({
      where: { id: inviteId }
    })
    
    if (!invite || invite.invitedUserId !== userId) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Invite not found' },
        id: request.id
      }
    }
    
    await prisma.userGroupMember.create({
      data: {
        id: await generateSnowflakeId(),
        groupId: invite.groupId,
        userId,
        addedBy: invite.invitedBy,
        joinedAt: new Date()
      }
    })
    
    await prisma.userGroupInvite.update({
      where: { id: inviteId },
      data: { status: 'accepted' }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleAcceptGroupInvite', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to accept group invite' },
      id: request.id
    }
  }
}

export async function handleDeclineGroupInvite(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = DeclineGroupInviteParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { inviteId } = validation.data
    const userId = agentId
    
    await prisma.userGroupInvite.updateMany({
      where: {
        id: inviteId,
        invitedUserId: userId
      },
      data: { status: 'declined' }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleDeclineGroupInvite', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to decline group invite' },
      id: request.id
    }
  }
}

