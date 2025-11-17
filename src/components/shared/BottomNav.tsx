'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, Bell, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Suspense, useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'

/**
 * Bottom navigation content component for mobile devices.
 * 
 * Provides mobile navigation with Feed, Markets, Chats, Agents, and Notifications tabs.
 * Shows unread message and notification badges. Automatically hides on production
 * home page unless dev mode is enabled via URL parameter.
 * 
 * @returns Bottom navigation element or null if hidden
 */
function BottomNavContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { authenticated, user } = useAuth()
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const { totalUnread: unreadMessages } = useUnreadMessages()

  // Check if dev mode is enabled via URL parameter
  const isDevMode = searchParams.get('dev') === 'true'
  
  // Hide bottom nav on production (babylon.market) on home page unless ?dev=true
  const isProduction = typeof window !== 'undefined' && window.location.hostname === 'babylon.market'
  const isHomePage = pathname === '/'
  const shouldHide = isProduction && isHomePage && !isDevMode

  // Poll for unread notifications
  useEffect(() => {
    if (!authenticated || !user) {
      setUnreadNotifications(0)
      return
    }

    const fetchUnreadCount = async () => {
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      
      if (!token) {
        return
      }

      const response = await fetch('/api/notifications?unreadOnly=true&limit=1', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUnreadNotifications(data.unreadCount || 0)
      }
    }

    fetchUnreadCount()

    // Refresh every 1 minute
    const interval = setInterval(fetchUnreadCount, 60000) // 60 seconds = 1 minute
    return () => clearInterval(interval)
  }, [authenticated, user])

  // If should be hidden, don't render anything
  if (shouldHide) {
    return null
  }

  const navItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      color: '#0066FF',
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      color: '#0066FF',
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: '#0066FF',
      active: pathname === '/chats',
    },
    {
      name: 'Agents',
      href: '/agents',
      icon: Bot,
      color: '#0066FF',
      active: pathname === '/agents' || pathname.startsWith('/agents/'),
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      color: '#0066FF',
      active: pathname === '/notifications',
    }
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-sidebar border-t border-border bottom-nav-rounded">
      {/* Navigation Items */}
      <div className="flex justify-between items-center h-14 px-4 safe-area-bottom">
        <div className="flex justify-around items-center flex-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const hasNotificationBadge = (item.name === 'Notifications' && unreadNotifications > 0) || 
                                          (item.name === 'Chats' && unreadMessages > 0)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center justify-center w-12 h-12 rounded-lg transition-colors duration-200',
                  'hover:bg-sidebar-accent/50',
                  'relative'
                )}
                aria-label={item.name}
              >
                <Icon
                  className={cn(
                    'w-6 h-6 transition-colors duration-200',
                    item.active ? 'text-sidebar-primary' : 'text-sidebar-foreground'
                  )}
                  style={{
                    color: item.active ? item.color : undefined,
                  }}
                />
                {hasNotificationBadge && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-sidebar" />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

/**
 * Bottom navigation component wrapper with Suspense boundary.
 * 
 * Wraps BottomNavContent in a Suspense boundary to handle async navigation
 * hooks gracefully. Provides mobile navigation for the application.
 * 
 * @returns Bottom navigation element wrapped in Suspense
 */
export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavContent />
    </Suspense>
  )
}
