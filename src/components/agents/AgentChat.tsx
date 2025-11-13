'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/shared/Avatar'
import { Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelUsed?: string
  pointsCost: number
  createdAt: string
}

interface AgentChatProps {
  agent: {
    id: string
    name: string
    profileImageUrl?: string
    pointsBalance: number
    modelTier: 'free' | 'pro'
  }
  onUpdate: () => void
}

export function AgentChat({ agent, onUpdate }: AgentChatProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [usePro, setUsePro] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchMessages()
  }, [agent.id])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = async () => {
    try {
      setLoading(true)
      const token = window.__privyAccessToken
      
      const res = await fetch(`/api/agents/${agent.id}/chat?limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json() as { messages: Message[] }
        setMessages(data.messages.reverse())
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || sending) return

    const userMessage = input
    setInput('')
    setSending(true)

    // Optimistically add user message
    const optimisticMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      pointsCost: 0,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, optimisticMessage])

    try {
      const token = window.__privyAccessToken
      
      const res = await fetch(`/api/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          usePro
        })
      })

      if (!res.ok) {
        const error = await res.json() as { error: string }
        throw new Error(error.error || 'Failed to send message')
      }

      const data = await res.json() as { messageId: string; response: string; modelUsed: string; pointsCost: number }

      // Add assistant message
      const assistantMessage: Message = {
        id: data.messageId,
        role: 'assistant',
        content: data.response,
        modelUsed: data.modelUsed,
        pointsCost: data.pointsCost,
        createdAt: new Date().toISOString()
      }
      setMessages(prev => [...prev, assistantMessage])

      // Update agent balance
      onUpdate()
      
      toast.success(`Message sent (-${data.pointsCost} points)`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message')
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Chat with {agent.name}</h3>
          <p className="text-sm text-gray-400">{agent.pointsBalance} points available</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={usePro ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUsePro(!usePro)}
            disabled={agent.modelTier === 'free'}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {usePro ? 'Pro Mode' : 'Free Mode'}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && messages.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            Loading chat history...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="mb-2">No messages yet</p>
            <p className="text-sm">Start a conversation with your agent!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <Avatar
                  id={agent.id}
                  name={agent.name}
                  type="user"
                  size="sm"
                  src={agent.profileImageUrl}
                  imageUrl={agent.profileImageUrl}
                />
              )}
              
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <div className="flex items-center gap-2 mt-1 text-xs opacity-70">
                  <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                  {message.modelUsed && (
                    <>
                      <span>•</span>
                      <span>{message.modelUsed}</span>
                    </>
                  )}
                  {message.pointsCost > 0 && (
                    <>
                      <span>•</span>
                      <span>{message.pointsCost}pts</span>
                    </>
                  )}
                </div>
              </div>

              {message.role === 'user' && user && (
                <Avatar
                  id={user.id}
                  name={user.displayName || user.email || 'You'}
                  type="user"
                  size="sm"
                  src={user.profileImageUrl}
                  imageUrl={user.profileImageUrl}
                />
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-3 justify-start">
            <Avatar
              id={agent.id}
              name={agent.name}
              type="user"
              size="sm"
              src={agent.profileImageUrl}
              imageUrl={agent.profileImageUrl}
            />
            <div className="bg-muted rounded-lg p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        {agent.pointsBalance < 1 ? (
          <div className="text-center text-red-400 text-sm py-2">
            Insufficient points. Please deposit points to continue chatting.
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={sending}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || sending || agent.pointsBalance < 1}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

