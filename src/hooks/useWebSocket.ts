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
        setError('Authentication required')
        return
      }

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:3001/ws/chat?token=${token}`
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setError(null)
        reconnectAttempts.current = 0
      }

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        const g = getGlobal()
        const subs = g[SUBSCRIBERS_KEY] || 0
        // Attempt to reconnect only if not a normal closure AND there are subscribers
        if (subs > 0 && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('WebSocket connection error')
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

  // Auto-connect on mount
  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

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
