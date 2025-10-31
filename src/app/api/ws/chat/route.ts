import { NextRequest } from 'next/server'
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { parse } from 'url'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '@/lib/api/auth-middleware'

const prisma = new PrismaClient()

interface AuthenticatedWebSocket extends WSWebSocket {
  userId?: string
  chatId?: string
  isAlive?: boolean
}

interface ChatMessage {
  id: string
  content: string
  chatId: string
  senderId: string
  createdAt: string
  isGameChat?: boolean
}

interface WebSocketMessage {
  type: 'join_chat' | 'leave_chat' | 'new_message' | 'error' | 'pong'
  data?: any
  error?: string
}

// Global WebSocket server instance
let wss: WebSocketServer | null = null
let clients: Map<string, AuthenticatedWebSocket> = new Map()
let chatRooms: Map<string, Set<string>> = new Map()
let serverInitializationPromise: Promise<WebSocketServer> | null = null
let serverInitializationError: Error | null = null

function initializeWebSocketServer(): WebSocketServer | null {
  if (wss) return wss
  
  // If initialization is in progress, return null (caller should wait)
  if (serverInitializationPromise) return null
  
  // If initialization failed, return null
  if (serverInitializationError) return null

  try {
    wss = new WebSocketServer({ 
      port: 3001,
      path: '/ws/chat'
    })

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection attempt')
    
    // Set up ping/pong for connection health
    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    // Handle authentication
    try {
      const url = parse(req.url || '', true)
      const token = url.query?.token as string
      
      if (!token) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Authentication token required'
        }))
        ws.close()
        return
      }

      // Authenticate the user (shim minimal NextRequest headers)
      const headers = new Headers()
      headers.set('authorization', `Bearer ${token}`)
      const user = await authenticate({ headers } as any)

      ws.userId = user.userId
      console.log(`WebSocket authenticated for user: ${user.userId}`)

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'pong',
        data: { message: 'Connected successfully' }
      }))

    } catch (error) {
      console.error('WebSocket authentication failed:', error)
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Authentication failed'
      }))
      ws.close()
      return
    }

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString())
        await handleMessage(ws, message)
      } catch (error) {
        console.error('Error handling WebSocket message:', error)
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format'
        }))
      }
    })

    // Handle disconnection
    ws.on('close', () => {
      if (ws.userId) {
        leaveAllChats(ws.userId)
        clients.delete(ws.userId)
        console.log(`User ${ws.userId} disconnected`)
      }
    })

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error)
      if (ws.userId) {
        leaveAllChats(ws.userId)
        clients.delete(ws.userId)
      }
    })
  })

    // Set up ping interval to keep connections alive
    const pingInterval = setInterval(() => {
      wss?.clients.forEach((client) => {
        const ws = client as AuthenticatedWebSocket;
        if (!ws.isAlive) {
          ws.terminate()
          return
        }
        ws.isAlive = false
        ws.ping()
      })
    }, 30000)

    wss.on('close', () => {
      clearInterval(pingInterval)
    })

    console.log('WebSocket server initialized on port 3001')
    return wss
  } catch (error) {
    console.error('Failed to initialize WebSocket server:', error)
    serverInitializationError = error instanceof Error ? error : new Error(String(error))
    wss = null
    return null
  }
}

// Initialize server on module load (runs when Next.js server starts)
if (typeof window === 'undefined') {
  // Only run on server side
  try {
    initializeWebSocketServer()
  } catch (error) {
    console.error('Failed to auto-initialize WebSocket server:', error)
    serverInitializationError = error instanceof Error ? error : new Error(String(error))
  }
}

async function handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
  if (!ws.userId) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Not authenticated'
    }))
    return
  }

  switch (message.type) {
    case 'join_chat':
      await joinChat(ws, message.data?.chatId)
      break
    
    case 'leave_chat':
      leaveChat(ws.userId, message.data?.chatId)
      break
    
    case 'pong':
      ws.send(JSON.stringify({ type: 'pong' }))
      break
    
    default:
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Unknown message type'
      }))
  }
}

async function joinChat(ws: AuthenticatedWebSocket, chatId: string) {
  if (!chatId || !ws.userId) return

  // Check if user has access to this chat
  const isGameChat = chatId.includes('-')
  let hasAccess = true

  if (!isGameChat) {
    // For database chats, check membership
    const membership = await prisma.groupChatMembership.findUnique({
      where: {
        userId_chatId: {
          userId: ws.userId,
          chatId
        }
      }
    })
    hasAccess = !!membership
  }

  if (!hasAccess) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Access denied to this chat'
    }))
    return
  }

  // Store client and join room
  clients.set(ws.userId, ws)
  ws.chatId = chatId

  if (!chatRooms.has(chatId)) {
    chatRooms.set(chatId, new Set())
  }
  chatRooms.get(chatId)!.add(ws.userId)

  console.log(`User ${ws.userId} joined chat ${chatId}`)
}

function leaveChat(userId: string, chatId: string) {
  if (!chatId) return

  const room = chatRooms.get(chatId)
  if (room) {
    room.delete(userId)
    if (room.size === 0) {
      chatRooms.delete(chatId)
    }
  }

  console.log(`User ${userId} left chat ${chatId}`)
}

function leaveAllChats(userId: string) {
  for (const [chatId, room] of chatRooms.entries()) {
    room.delete(userId)
    if (room.size === 0) {
      chatRooms.delete(chatId)
    }
  }
}

// Broadcast a new message to all clients in a chat room
export function broadcastMessage(chatId: string, message: ChatMessage) {
  const room = chatRooms.get(chatId)
  if (!room) return

  const messageData = {
    type: 'new_message',
    data: message
  }

  room.forEach(userId => {
    const client = clients.get(userId)
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(messageData))
    }
  })

  console.log(`Broadcasted message to ${room.size} clients in chat ${chatId}`)
}

// Initialize WebSocket server on first request
export async function GET(request: NextRequest) {
  try {
    // Initialize WebSocket server if not already done
    if (!wss) {
      const result = initializeWebSocketServer()
      if (!result && serverInitializationError) {
        return new Response(JSON.stringify({
          error: 'Failed to initialize WebSocket server',
          details: serverInitializationError.message,
          port: 3001
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      }
    }

    return new Response(JSON.stringify({
      status: wss ? 'WebSocket server running' : 'WebSocket server not initialized',
      port: 3001,
      path: '/ws/chat',
      connectedClients: clients.size,
      initialized: !!wss
    }), {
      status: wss ? 200 : 503,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error checking WebSocket server status:', error)
    return new Response(JSON.stringify({
      error: 'Failed to check WebSocket server status',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
}
