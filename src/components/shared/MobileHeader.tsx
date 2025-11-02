'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, Home, TrendingUp, MessageCircle, Trophy, Gift, Info, Bell, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModal } from '@/hooks/useLoginModal'
import { usePathname } from 'next/navigation'
import { logger } from '@/lib/logger'

export function MobileHeader() {
  const { authenticated } = useAuth()
  const { user } = useAuthStore()
  const { showLoginModal } = useLoginModal()
  const [showSideMenu, setShowSideMenu] = useState(false)
  const [pointsData, setPointsData] = useState<{ available: number; total: number } | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const fetchPoints = async () => {
      if (!authenticated || !user?.id) {
        setPointsData(null)
        return
      }

      try {
        const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(`/api/users/${user.id}/balance`, { headers })
        if (response.ok) {
          const data = await response.json()
          setPointsData({
            available: Number(data.balance || 0),
            total: Number(data.totalDeposited || 0),
          })
        }
      } catch (error) {
        logger.error('Error fetching points:', error, 'MobileHeader')
      }
    }

    fetchPoints()
    const interval = setInterval(fetchPoints, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user?.id])

  const menuItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      active: pathname === '/chats',
    },
    {
      name: 'Leaderboards',
      href: '/leaderboard',
      icon: Trophy,
      active: pathname === '/leaderboard',
    },
    {
      name: 'Referrals',
      href: '/referrals',
      icon: Gift,
      active: pathname === '/referrals',
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      active: pathname === '/notifications',
    },
  ]

  return (
    <>
      <header
        className={cn(
          'md:hidden',
          'fixed top-0 left-0 right-0 z-40',
          'bg-sidebar/95',
          'border-b border-border'
        )}
      >
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left: Logo */}
          <div className="flex-shrink-0">
            <Link href="/feed" className="hover:scale-105 transition-transform duration-300">
              <Image
                src="/assets/logos/logo.svg"
                alt="Babylon Logo"
                width={28}
                height={28}
                className="w-7 h-7"
              />
            </Link>
          </div>

          {/* Center: Points */}
          <div className="flex-1 flex justify-center items-center gap-1">
            {authenticated && pointsData ? (
              <>
                <span className="text-sm font-semibold text-foreground">
                  {pointsData.available.toLocaleString()} / {pointsData.total.toLocaleString()} pts
                </span>
                <Info className="w-4 h-4 text-muted-foreground" />
              </>
            ) : authenticated ? (
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : null}
          </div>

          {/* Right: Profile Picture (when authenticated) or Login button */}
          <div className="flex-shrink-0 w-8">
            {authenticated && user ? (
              <button
                onClick={() => setShowSideMenu(true)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold hover:opacity-80 transition-opacity"
                aria-label="Open profile menu"
              >
                {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || <UserIcon className="w-4 h-4" />}
              </button>
            ) : !authenticated ? (
              <button
                onClick={() => showLoginModal()}
                className="px-3 py-1.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Login
              </button>
            ) : (
              <div className="w-8" />
            )}
          </div>
        </div>
      </header>

      {/* Side Menu */}
      {showSideMenu && authenticated && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setShowSideMenu(false)}
          />

          {/* Menu Panel - slides in from left */}
          <div className="fixed top-0 left-0 bottom-0 z-50 md:hidden bg-sidebar border-r border-border w-[280px] animate-in slide-in-from-left duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground truncate">
                    {user?.displayName || user?.email || 'User'}
                  </div>
                  {user?.email && (
                    <div className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowSideMenu(false)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* Menu Items */}
            <nav className="p-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setShowSideMenu(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                      item.active 
                        ? 'bg-[#1da1f2] text-white' 
                        : 'text-sidebar-foreground hover:bg-sidebar-accent'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </>
      )}
    </>
  )
}

