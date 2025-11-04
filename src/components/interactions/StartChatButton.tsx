'use client'

import { useState } from 'react'
import { MessageCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePrivy } from '@privy-io/react-auth'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface StartChatButtonProps {
  userId: string
  isActor?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'button' | 'icon'
  className?: string
}

export function StartChatButton({
  userId,
  isActor = false,
  size = 'md',
  variant = 'button',
  className,
}: StartChatButtonProps) {
  const router = useRouter()
  const { authenticated, user } = useAuth()
  const { getAccessToken } = usePrivy()
  const [loading, setLoading] = useState(false)

  const handleStartChat = async () => {
    if (!authenticated || !user) {
      toast.error('Please sign in to start a chat')
      return
    }

    if (user.id === userId) {
      return
    }

    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('Authentication required')
        setLoading(false)
        return
      }

      // Create or get DM chat
      const response = await fetch('/api/chats/dm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start chat')
      }

      // Navigate to the chat page with the chat ID
      router.push(`/chats?chat=${data.chat.id}`)
      
      if (isActor) {
        toast.success('Chat started! Note: Actors may not respond unless you have a high relationship with them.')
      } else {
        toast.success('Chat started!')
      }
    } catch (error) {
      logger.error('Error starting chat:', error, 'StartChatButton')
      toast.error('Failed to start chat')
    } finally {
      setLoading(false)
    }
  }

  if (!authenticated) {
    return null
  }

  const sizeClasses = {
    sm: {
      icon: 'w-3 h-3',
      button: 'text-xs px-2 py-1',
    },
    md: {
      icon: 'w-4 h-4',
      button: 'text-sm px-3 py-1.5',
    },
    lg: {
      icon: 'w-5 h-5',
      button: 'text-base px-4 py-2',
    },
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleStartChat}
        disabled={loading}
        className={cn(
          'p-2 rounded transition-colors',
          'text-primary hover:text-primary/80',
          loading && 'opacity-50 cursor-not-allowed',
          className
        )}
        aria-label="Start chat"
      >
        {loading ? (
          <Loader2 className={cn('animate-spin', sizeClasses[size].icon)} />
        ) : (
          <MessageCircle className={sizeClasses[size].icon} />
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleStartChat}
      disabled={loading}
      className={cn(
        'flex items-center gap-2 rounded-full transition-all duration-200',
        'border border-border hover:bg-muted',
        'text-foreground font-medium',
        sizeClasses[size].button,
        loading && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 className={cn('animate-spin', sizeClasses[size].icon)} />
          <span>Starting...</span>
        </>
      ) : (
        <>
          <MessageCircle className={sizeClasses[size].icon} />
          <span>Message</span>
        </>
      )}
    </button>
  )
}







