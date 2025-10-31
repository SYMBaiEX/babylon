'use client'

import { Bell } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

interface NotificationsButtonProps {
  className?: string
  compact?: boolean
}

interface Notification {
  id: string
  type: string
  message: string
  read: boolean
  createdAt: string
}

export function NotificationsButton({ className, compact = false }: NotificationsButtonProps) {
  const { authenticated, user } = useAuth()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!authenticated || !user) {
      setUnreadCount(0)
      return
    }

    const fetchUnreadCount = async () => {
      try {
        setIsLoading(true)
        const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
        
        if (!token) {
          setIsLoading(false)
          return
        }

        const response = await fetch('/api/notifications?unreadOnly=true&limit=1', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          // Type the response properly using Notification interface
          const notifications: Notification[] = data.notifications || []
          const unreadNotifications = notifications.filter((n: Notification) => !n.read)
          setUnreadCount(unreadNotifications.length || data.unreadCount || 0)
        }
      } catch (error) {
        logger.error('Error fetching notification count:', error, 'NotificationsButton')
      } finally {
        setIsLoading(false)
      }
      
      // isLoading is used via setIsLoading calls
    }

    fetchUnreadCount()

    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user])

  if (!authenticated) {
    return null
  }

  const handleClick = () => {
    router.push('/notifications')
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'relative p-2 hover:bg-sidebar-accent transition-colors',
        isLoading && 'opacity-50 cursor-wait',
        className
      )}
      aria-label="Notifications"
      aria-busy={isLoading}
    >
      <Bell className={cn(
        'text-sidebar-foreground',
        compact ? 'w-5 h-5' : 'w-6 h-6',
        isLoading && 'animate-pulse'
      )} />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-background" />
      )}
    </button>
  )
}

