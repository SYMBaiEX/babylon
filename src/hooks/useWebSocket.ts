import { useEffect, useRef, useState, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'

interface WebSocketMessage {
  type: 'join_chat' | 'leave_chat' | 'new_message' | 'error' | 'pong'
  data?: any
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
const getGlobal = () => (globalThis as any)
const SOCKET_KEY = '__babylon_chat_socket__'
const SUBSCRIBERS_KEY = '__babylon_chat_socket_subscribers__'

export function useWebSocket() {
  const { getAccessToken } = usePrivy()
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
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
        const healthCheckUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? '443' : '80')}/api/ws/chat`
        const healthResponse = await fetch(healthCheckUrl)
        const healthData = await healthResponse.json()
        
        if (!healthData.initialized) {
          setError('WebSocket server is not initialized. Please ensure the server is running.')
          console.warn('WebSocket server not initialized')
          return
        }
      } catch (healthError) {
        // Health check failed - server might not be ready yet, but we'll try connecting anyway
        if (reconnectAttempts.current === 0) {
          console.warn('WebSocket server health check failed, attempting connection anyway:', healthError)
        }
      }

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:3001/ws/chat?token=${token}`
      
      // Only log connection attempt if not retrying (to reduce noise)
      if (reconnectAttempts.current === 0) {
        console.log('Connecting to WebSocket server...', wsUrl.replace(/token=[^&]+/, 'token=***'))
      }
      
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
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
            console.log('WebSocket disconnected:', {
              code: event.code,
              reason: event.reason || 'No reason provided',
              wasClean: event.wasClean,
              subscribers: subs
            })
          }
        }
        
        // Attempt to reconnect only if not a normal closure AND there are subscribers
        if (subs > 0 && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          // Only log reconnection attempts on first few tries to reduce noise
          if (reconnectAttempts.current < 2) {
            console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`)
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        } else if (subs > 0 && reconnectAttempts.current >= maxReconnectAttempts) {
          console.warn('WebSocket: Max reconnection attempts reached. Server may not be running on port 3001.')
          setError('Unable to connect to chat server. Chat features may be unavailable.')
        } else if (event.code === 1000) {
          // Clean close - clear any previous errors
          setError(null)
        }
      }

      ws.onerror = (errorEvent) => {
        // WebSocket error events don't provide much information in the error object itself
        // The actual error details come from the close event (code, reason)
        // However, we can check the readyState to provide context
        const errorMessage = ws.readyState === WebSocket.CLOSED 
          ? 'Connection failed - server may not be running on port 3001'
          : ws.readyState === WebSocket.CONNECTING
          ? 'Connection timeout - server may not be responding'
          : 'WebSocket connection error'
        
        // Only log meaningful errors or on first attempt
        if (reconnectAttempts.current === 0) {
          console.error('WebSocket error:', {
            message: errorMessage,
            readyState: ws.readyState,
            url: wsUrl.replace(/token=[^&]+/, 'token=***')
          })
        }
        
        // Don't set error state here - let onclose handle it with proper error codes
      }

      setSocket(ws)
      // Save shared socket and increment subscribers
      const g2 = getGlobal()
      g2[SOCKET_KEY] = ws
      g2[SUBSCRIBERS_KEY] = (g2[SUBSCRIBERS_KEY] || 0) + 1
    } catch (err) {
      console.error('Failed to connect WebSocket:', err)
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
        data: { chatId }
      }
      socket.send(JSON.stringify(message))
    }
  }, [socket])

  const leaveChat = useCallback((chatId: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type: 'leave_chat',
        data: { chatId }
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

  // Join/leave chat when chatId changes
  useEffect(() => {
    if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) return

    if (chatId) {
      joinChat(chatId)
    } else {
      // Leave previous chat if any
      leaveChat(chatId || '')
    }
  }, [chatId, isConnected, socket, joinChat, leaveChat])

  // Listen for new messages
  useEffect(() => {
    if (!socket) return

    const handleMessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        
        if (message.type === 'new_message' && message.data) {
          const newMessage: ChatMessage = message.data
          
          // Only add message if it's for the current chat
          if (newMessage.chatId === chatId) {
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
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
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
