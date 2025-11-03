/**
 * useWebSocket Hook (DEPRECATED)
 * 
 * ⚠️ DEPRECATED: This hook is no longer used.
 * The application now uses Server-Sent Events (SSE) for real-time updates.
 * 
 * Use instead:
 * - useSSE() for SSE connections
 * - useChannelSubscription() for channel subscriptions
 * - useChatMessages() for chat messages
 * 
 * See: SSE_MIGRATION.md for migration guide
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { WebSocketData } from '@/types/common'
import { logger } from '@/lib/logger'

interface WebSocketMessage {
  type: 'join_chat' | 'leave_chat' | 'new_message' | 'error' | 'pong'
  data?: WebSocketData
  error?: string
}

interface ChatMessage {
  id: string
  content: string
  chatId: string
  senderId: string
  createdAt: string
  isGameChat?: boolean
}

// Global shared socket to avoid multiple connections (React StrictMode / re-mounts)
// Type-safe global socket access
interface GlobalSocketType {
  [SOCKET_KEY]?: WebSocket | null
  [SUBSCRIBERS_KEY]?: number
}
const getGlobal = (): GlobalSocketType => (globalThis as typeof globalThis & GlobalSocketType)
const SOCKET_KEY = '__babylon_chat_socket__'
const SUBSCRIBERS_KEY = '__babylon_chat_socket_subscribers__'

export function useWebSocket() {
  const { getAccessToken } = usePrivy()
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = useCallback(async () => {
    try {
      // Reuse existing shared socket if present
      const g = getGlobal()
      const existing: WebSocket | null = g[SOCKET_KEY] || null
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        setSocket(existing)
        setIsConnected(existing.readyState === WebSocket.OPEN)
        setError(null)
        // Track subscribers
        g[SUBSCRIBERS_KEY] = (g[SUBSCRIBERS_KEY] || 0) + 1
        return
      }

      const token = await getAccessToken()
      if (!token) {
        // Silently fail if not authenticated - this is expected for unauthenticated users
        setError(null)
        return
      }

      // Check if WebSocket server is available before attempting connection
      try {
        // Use the same origin as the current page (Next.js API routes are on the same port)
        const healthCheckUrl = `${window.location.origin}/api/ws/chat`
        const healthResponse = await fetch(healthCheckUrl)
        
        if (!healthResponse.ok) {
          throw new Error(`Health check failed: ${healthResponse.status}`)
        }
        
        const healthData = await healthResponse.json()
        
        if (!healthData.initialized) {
          setError('WebSocket server is not initialized. Please ensure the server is running.')
          logger.warn('WebSocket server not initialized', undefined, 'useWebSocket')
          return
        }
      } catch (healthError) {
        // Health check failed - server might not be ready yet, but we'll try connecting anyway
        // Only log on first attempt to reduce noise
        if (reconnectAttempts.current === 0) {
          logger.warn('WebSocket server health check failed, attempting connection anyway:', healthError, 'useWebSocket')
        }
      }

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:3001/ws/chat?token=${token}`
      
      // Only log connection attempt if not retrying (to reduce noise)
      if (reconnectAttempts.current === 0) {
        logger.debug('Connecting to WebSocket server...', wsUrl.replace(/token=[^&]+/, 'token=***'), 'useWebSocket')
      }
      
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        logger.info('WebSocket connected', undefined, 'useWebSocket')
        setIsConnected(true)
        setError(null)
        reconnectAttempts.current = 0
      }

      ws.onclose = (event) => {
        const g = getGlobal()
        const subs = g[SUBSCRIBERS_KEY] || 0
        
        setIsConnected(false)
        
        // Log only if it's an unexpected closure (not a clean close)
        if (event.code !== 1000) {
          // Only log on first disconnect or when giving up to reduce noise
          if (reconnectAttempts.current === 0 || reconnectAttempts.current >= maxReconnectAttempts) {
            logger.info('WebSocket disconnected:', {
              code: event.code,
              reason: event.reason || 'No reason provided',
              wasClean: event.wasClean,
              subscribers: subs
            }, 'useWebSocket')
          }
        }
        
        // Attempt to reconnect only if not a normal closure AND there are subscribers
        if (subs > 0 && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          // Only log reconnection attempts on first few tries to reduce noise
          if (reconnectAttempts.current < 2) {
            logger.debug(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`, undefined, 'useWebSocket')
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        } else if (subs > 0 && reconnectAttempts.current >= maxReconnectAttempts) {
          logger.warn('WebSocket: Max reconnection attempts reached. Server may not be running on port 3001.', undefined, 'useWebSocket')
          setError('Unable to connect to chat server. Chat features may be unavailable.')
        } else if (event.code === 1000) {
          // Clean close - clear any previous errors
          setError(null)
        }
      }

      ws.onerror = (errorEvent) => {
        // WebSocket error events don't provide much information in the error object itself
        // The actual error details come from the close event (code, reason)
        // Only log errors on first attempt and only if the socket is actually closed (not connecting)
        // This prevents logging transient errors that resolve
        if (reconnectAttempts.current === 0 && ws.readyState === WebSocket.CLOSED) {
          const errorMessage = 'Connection failed - server may not be running on port 3001'
          
          // Log as debug instead of error - WebSocket server is optional for most features
          // Only show in console if WebSocket features are actually needed
          if (errorEvent && errorEvent.type) {
            logger.debug('WebSocket connection attempt failed (server may not be running):', { type: errorEvent.type, message: errorMessage }, 'useWebSocket');
          } else {
            logger.debug('WebSocket connection attempt failed (server may not be running):', {
              message: errorMessage,
              readyState: ws.readyState,
              url: wsUrl.replace(/token=[^&]+/, 'token=***')
            }, 'useWebSocket')
          }
        }
        
        // Don't set error state here - let onclose handle it with proper error codes
        // The onclose handler will manage reconnection logic
      }

      setSocket(ws)
      // Save shared socket and increment subscribers
      const g2 = getGlobal()
      g2[SOCKET_KEY] = ws
      g2[SUBSCRIBERS_KEY] = (g2[SUBSCRIBERS_KEY] || 0) + 1
    } catch (err) {
      logger.error('Failed to connect WebSocket:', err, 'useWebSocket')
      setError('Failed to connect to chat server')
    }
  }, [getAccessToken])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    const g = getGlobal()
    g[SUBSCRIBERS_KEY] = Math.max(0, (g[SUBSCRIBERS_KEY] || 0) - 1)
    const remaining = g[SUBSCRIBERS_KEY]
    if (socket && remaining === 0) {
      socket.close(1000, 'All subscribers disconnected')
      g[SOCKET_KEY] = null
    }
    setSocket(null)
    
    setIsConnected(false)
  }, [socket])

  const joinChat = useCallback((chatId: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type: 'join_chat',
        data: { type: 'join_chat', chatId } as WebSocketData
      }
      socket.send(JSON.stringify(message))
    }
  }, [socket])

  const leaveChat = useCallback((chatId: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type: 'leave_chat',
        data: { type: 'leave_chat', chatId } as WebSocketData
      }
      socket.send(JSON.stringify(message))
    }
  }, [socket])

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    }
  }, [socket])

  // Auto-connect on mount, but only if authenticated
  useEffect(() => {
    // Check if user is authenticated before attempting connection
    getAccessToken()
      .then(token => {
        if (token) {
          connect()
        }
      })
      .catch(() => {
        // Silently fail if not authenticated - this is expected
      })

    return () => {
      disconnect()
    }
  }, [connect, disconnect, getAccessToken])

  return {
    socket,
    isConnected,
    error,
    connect,
    disconnect,
    joinChat,
    leaveChat,
    sendMessage
  }
}

export function useChatMessages(chatId: string | null) {
  const { socket, isConnected, joinChat, leaveChat } = useWebSocket()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const previousChatIdRef = useRef<string | null>(null)
  const previousSocketRef = useRef<WebSocket | null>(null)

  // Join/leave chat when chatId changes or socket reconnects
  useEffect(() => {
    // Only proceed if socket is ready
    if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) {
      setIsLoading(false);
      return;
    }

    const previousChatId = previousChatIdRef.current
    const previousSocket = previousSocketRef.current

    // Skip if chatId hasn't changed AND socket hasn't changed (prevent infinite loops)
    if (previousChatId === chatId && previousSocket === socket && previousChatId !== null) {
      return;
    }

    // Leave previous chat if switching to a new one
    if (previousChatId && previousChatId !== chatId) {
      leaveChat(previousChatId)
    }

    // Join new chat if provided (or rejoin if socket reconnected)
    if (chatId) {
      setIsLoading(true); // Set loading when joining chat
      joinChat(chatId)
      previousChatIdRef.current = chatId
      previousSocketRef.current = socket
    } else {
      setIsLoading(false);
      previousChatIdRef.current = null
      previousSocketRef.current = socket
    }
  }, [chatId, isConnected, socket, joinChat, leaveChat])

  // Listen for new messages
  useEffect(() => {
    if (!socket) return

    const handleMessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        
        if (message.type === 'new_message' && message.data) {
          // Type guard for ChatMessage
          const messageData = message.data as Record<string, unknown>
          if (
            typeof messageData.id === 'string' &&
            typeof messageData.content === 'string' &&
            typeof messageData.chatId === 'string' &&
            typeof messageData.senderId === 'string' &&
            typeof messageData.createdAt === 'string'
          ) {
            const newMessage: ChatMessage = {
              id: messageData.id,
              content: messageData.content,
              chatId: messageData.chatId,
              senderId: messageData.senderId,
              createdAt: messageData.createdAt,
              isGameChat: typeof messageData.isGameChat === 'boolean' ? messageData.isGameChat : undefined,
            }
            
            // Only add message if it's for the current chat
            if (newMessage.chatId === chatId) {
              setIsLoading(false); // Mark as loaded when message arrives
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(msg => msg.id === newMessage.id)) {
                  return prev
                }
                return [...prev, newMessage].sort((a, b) => 
                  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                )
              })
            }
          }
        }
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error'
        logger.error('Error parsing WebSocket message:', errorMessage, 'useWebSocket')
      }
    }

    socket.addEventListener('message', handleMessage)
    return () => socket.removeEventListener('message', handleMessage)
  }, [socket, chatId])

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(msg => msg.id === message.id)) {
        return prev
      }
      return [...prev, message].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    })
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isLoading,
    addMessage,
    clearMessages
  }
}
