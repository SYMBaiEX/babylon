/**
 * WebSocket Message Types
 * 
 * Type-safe definitions for WebSocket communication between client and server
 */

import type { JsonValue } from './common'

/**
 * Chat message payload
 */
export interface ChatMessage {
  id: string
  content: string
  chatId: string
  senderId: string
  createdAt: string
  isGameChat?: boolean
}

/**
 * WebSocket channel types
 */
export type WebSocketChannel = 'feed' | 'markets' | 'breaking-news' | 'upcoming-events'

/**
 * WebSocket message type discriminator
 */
export type WebSocketMessageType = 
  | 'join_chat' 
  | 'leave_chat' 
  | 'subscribe' 
  | 'unsubscribe' 
  | 'new_message' 
  | 'channel_update'
  | 'error' 
  | 'pong'

/**
 * Base WebSocket message structure
 */
export interface BaseWebSocketMessage {
  type: WebSocketMessageType
  error?: string
}

/**
 * Join chat message data
 */
export interface JoinChatData {
  chatId: string
}

/**
 * Leave chat message data
 */
export interface LeaveChatData {
  chatId: string
}

/**
 * Subscribe to channel message data
 */
export interface SubscribeData {
  channel: WebSocketChannel
}

/**
 * Unsubscribe from channel message data
 */
export interface UnsubscribeData {
  channel: WebSocketChannel
}

/**
 * New message data
 */
export interface NewMessageData {
  message: ChatMessage
}

/**
 * Channel update data
 */
export interface ChannelUpdateData {
  channel: WebSocketChannel
  data: Record<string, JsonValue>
}

/**
 * Pong message data
 */
export interface PongData {
  message?: string
}

/**
 * Discriminated union of WebSocket message data by type
 */
export type WebSocketMessageData =
  | { type: 'join_chat'; data: JoinChatData }
  | { type: 'leave_chat'; data: LeaveChatData }
  | { type: 'subscribe'; data: SubscribeData }
  | { type: 'unsubscribe'; data: UnsubscribeData }
  | { type: 'new_message'; data: NewMessageData }
  | { type: 'channel_update'; data: ChannelUpdateData }
  | { type: 'pong'; data?: PongData }
  | { type: 'error'; error: string }

/**
 * Complete WebSocket message type
 */
export type WebSocketMessage = WebSocketMessageData

/**
 * Type guard to check if message has data property
 */
export function hasMessageData(
  message: WebSocketMessage
): message is Extract<WebSocketMessage, { data: unknown }> {
  return 'data' in message && message.data !== undefined
}

/**
 * Type guard to check if message is a chat-related message
 */
export function isChatMessage(
  message: WebSocketMessage
): message is Extract<WebSocketMessage, { type: 'join_chat' | 'leave_chat' | 'new_message' }> {
  return message.type === 'join_chat' || message.type === 'leave_chat' || message.type === 'new_message'
}

/**
 * Type guard to check if message is a channel-related message
 */
export function isChannelMessage(
  message: WebSocketMessage
): message is Extract<WebSocketMessage, { type: 'subscribe' | 'unsubscribe' | 'channel_update' }> {
  return message.type === 'subscribe' || message.type === 'unsubscribe' || message.type === 'channel_update'
}

/**
 * Validate that a parsed object is a valid WebSocketMessage
 * Use this when parsing JSON from WebSocket to ensure type safety
 */
export function isValidWebSocketMessage(obj: unknown): obj is WebSocketMessage {
  if (!obj || typeof obj !== 'object') return false
  
  const msg = obj as Record<string, unknown>
  
  // Must have a type field
  if (!msg.type || typeof msg.type !== 'string') return false
  
  // Validate based on message type
  switch (msg.type) {
    case 'join_chat':
    case 'leave_chat':
      return (
        typeof msg.data === 'object' &&
        msg.data !== null &&
        typeof (msg.data as Record<string, unknown>).chatId === 'string'
      )
    
    case 'subscribe':
    case 'unsubscribe':
      return (
        typeof msg.data === 'object' &&
        msg.data !== null &&
        typeof (msg.data as Record<string, unknown>).channel === 'string' &&
        ['feed', 'markets', 'breaking-news', 'upcoming-events'].includes(
          (msg.data as Record<string, unknown>).channel as string
        )
      )
    
    case 'new_message':
      const newMsgData = msg.data as Record<string, unknown>
      return (
        typeof msg.data === 'object' &&
        msg.data !== null &&
        typeof newMsgData.message === 'object' &&
        newMsgData.message !== null &&
        typeof (newMsgData.message as Record<string, unknown>).id === 'string' &&
        typeof (newMsgData.message as Record<string, unknown>).content === 'string' &&
        typeof (newMsgData.message as Record<string, unknown>).chatId === 'string' &&
        typeof (newMsgData.message as Record<string, unknown>).senderId === 'string' &&
        typeof (newMsgData.message as Record<string, unknown>).createdAt === 'string'
      )
    
    case 'channel_update':
      const channelData = msg.data as Record<string, unknown>
      return (
        typeof msg.data === 'object' &&
        msg.data !== null &&
        typeof channelData.channel === 'string' &&
        typeof channelData.data === 'object' &&
        channelData.data !== null
      )
    
    case 'pong':
      // Pong can have optional data
      return msg.data === undefined || typeof msg.data === 'object'
    
    case 'error':
      return typeof msg.error === 'string'
    
    default:
      return false
  }
}

