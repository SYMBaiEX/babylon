'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, Home, TrendingUp, MessageCircle, Trophy, Gift, Info, Bell, LogOut, Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModal } from '@/hooks/useLoginModal'
import { usePathname } from 'next/navigation'
import { logger } from '@/lib/logger'
import { Avatar } from '@/components/shared/Avatar'

export function MobileHeader() {
  const { authenticated, logout } = useAuth()
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
      name: 'Rewards',
      href: '/rewards',
      icon: Gift,
      active: pathname === '/rewards',
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
                className="hover:opacity-80 transition-opacity"
                aria-label="Open profile menu"
              >
                <Avatar 
                  id={user.id} 
                  name={user.displayName || user.email || 'User'} 
                  size="sm"
                  src={user.profileImageUrl}
                />
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
          <div className="fixed top-0 left-0 bottom-0 z-50 md:hidden bg-sidebar border-r-2 border-[#1c9cf0] w-[280px] animate-in slide-in-from-left duration-300 flex flex-col">
            {/* Header - User Profile */}
            <Link 
              href="/profile"
              onClick={() => setShowSideMenu(false)}
              className="flex items-center justify-between p-4 border-b-2 border-border hover:bg-sidebar-accent transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar 
                  id={user?.id} 
                  name={user?.displayName || user?.email || 'User'} 
                  size="md"
                  src={user?.profileImageUrl}
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground truncate">
                    {user?.displayName || user?.email || 'User'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    @{user?.username || `user${user?.id.slice(0, 8)}`}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  setShowSideMenu(false)
                }}
                className="p-2 hover:bg-muted transition-colors flex-shrink-0"
              >
                <X size={20} style={{ color: '#1c9cf0' }} />
              </button>
            </Link>

            {/* Points Display */}
            {pointsData && (
              <div className="px-4 py-4 border-b-2 border-border bg-muted/30">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1c9cf0' }}>
                    <Coins className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Balance</div>
                    <div className="font-bold text-base text-foreground mt-1">
                      {pointsData.available.toLocaleString()} pts
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      of {pointsData.total.toLocaleString()} total
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Items */}
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setShowSideMenu(false)}
                    className={cn(
                      'flex items-center gap-4 px-4 py-3 transition-colors',
                      item.active 
                        ? 'bg-[#1c9cf0] text-white font-bold' 
                        : 'text-sidebar-foreground hover:bg-sidebar-accent font-semibold'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-base">{item.name}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Logout Button at Bottom */}
            <div className="p-3 border-t-2 border-border">
              <button
                onClick={() => {
                  setShowSideMenu(false)
                  logout()
                }}
                className="flex items-center gap-4 px-4 py-3 w-full text-left text-destructive hover:bg-destructive/10 transition-colors font-semibold"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-base">Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

