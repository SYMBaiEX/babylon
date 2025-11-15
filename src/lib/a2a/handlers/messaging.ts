/**
 * A2A Messaging Handlers
 * Handlers for chats, messages, groups
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { logger } from '@/lib/logger'
import {
  GetChatMessagesParamsSchema,
  SendMessageParamsSchema,
  CreateGroupParamsSchema,
  LeaveChatParamsSchema,
} from '../validation'

export async function handleGetChats(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const userId = agentId
    
    const chatParticipations = await prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        Chat: {
          include: {
            ChatParticipant: true
          }
        }
      }
    })
    
    // Get all user IDs from participants
    const participantUserIds = new Set<string>()
    chatParticipations.forEach(cp => {
      cp.Chat.ChatParticipant.forEach(p => {
        participantUserIds.add(p.userId)
      })
    })
    
    // Fetch user details
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(participantUserIds) } },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true
      }
    })
    
    const usersMap = new Map(users.map(u => [u.id, u]))
    
    const chats = chatParticipations.map(cp => ({
      id: cp.Chat.id,
      name: cp.Chat.name,
      isGroup: cp.Chat.isGroup,
      participants: cp.Chat.ChatParticipant.map(p => usersMap.get(p.userId)).filter(Boolean)
    }))
    
    return {
      jsonrpc: '2.0',
      result: { chats } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetChats', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch chats' },
      id: request.id
    }
  }
}

export async function handleGetChatMessages(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetChatMessagesParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { chatId, limit, offset } = validation.data
    const userId = agentId
    
    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId }
    })
    
    if (!participant) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.FORBIDDEN, message: 'Not a member of this chat' },
        id: request.id
      }
    }
    
    const messages = await prisma.message.findMany({
      where: { chatId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' }
    })
    
    // Get sender IDs and fetch user details
    const senderIds = [...new Set(messages.map(m => m.senderId).filter(Boolean))]
    const users = await prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true
      }
    })
    const usersMap = new Map(users.map(u => [u.id, u]))
    
    return {
      jsonrpc: '2.0',
      result: {
        messages: messages.map(m => ({
          id: m.id,
          content: m.content,
          senderId: m.senderId,
          sender: m.senderId ? usersMap.get(m.senderId) : null,
          timestamp: m.createdAt
        }))
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetChatMessages', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch messages' },
      id: request.id
    }
  }
}

export async function handleSendMessage(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = SendMessageParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { chatId, content } = validation.data
    const userId = agentId
    
    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId }
    })
    
    if (!participant) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.FORBIDDEN, message: 'Not a member of this chat' },
        id: request.id
      }
    }
    
    const message = await prisma.message.create({
      data: {
        id: await generateSnowflakeId(),
        chatId,
        senderId: userId,
        content: content.trim(),
        createdAt: new Date()
      }
    })
    
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        messageId: message.id
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleSendMessage', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to send message' },
      id: request.id
    }
  }
}

export async function handleCreateGroup(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = CreateGroupParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { name, memberIds } = validation.data
    const userId = agentId
    
    const chat = await prisma.chat.create({
      data: {
        id: await generateSnowflakeId(),
        name,
        isGroup: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    
    const allMemberIds = [userId, ...memberIds]
    await Promise.all(
      allMemberIds.map(async (memberId) =>
        prisma.chatParticipant.create({
          data: {
            id: await generateSnowflakeId(),
            chatId: chat.id,
            userId: memberId,
            joinedAt: new Date()
          }
        })
      )
    )
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        chatId: chat.id
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleCreateGroup', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to create group' },
      id: request.id
    }
  }
}

export async function handleLeaveChat(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = LeaveChatParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { chatId } = validation.data
    const userId = agentId
    
    await prisma.chatParticipant.deleteMany({
      where: { chatId, userId }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleLeaveChat', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to leave chat' },
      id: request.id
    }
  }
}

export async function handleGetUnreadCount(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const userId = agentId
    
    const chatParticipations = await prisma.chatParticipant.findMany({
      where: { userId },
      select: { chatId: true }
    })
    
    let unreadCount = 0
    
    for (const participation of chatParticipations) {
      const count = await prisma.message.count({
        where: {
          chatId: participation.chatId,
          senderId: { not: userId }
        }
      })
      unreadCount += count
    }
    
    return {
      jsonrpc: '2.0',
      result: { unreadCount } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetUnreadCount', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch unread count' },
      id: request.id
    }
  }
}

