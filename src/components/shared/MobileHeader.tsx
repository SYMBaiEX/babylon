'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, Home, TrendingUp, MessageCircle, Trophy, Gift, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModal } from '@/hooks/useLoginModal'
import { usePathname } from 'next/navigation'

export function MobileHeader() {
  const { authenticated } = useAuth()
  const { user } = useAuthStore()
  const { showLoginModal } = useLoginModal()
  const [showSideMenu, setShowSideMenu] = useState(false)
  const pathname = usePathname()

  const menuItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Leaderboard',
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
      name: 'Profile',
      href: '/profile',
      icon: UserIcon,
      active: pathname === '/profile',
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
          {/* Left: Profile Picture (when authenticated) */}
          <div className="flex-shrink-0 w-8">
            {authenticated && user ? (
              <button
                onClick={() => setShowSideMenu(true)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold hover:opacity-80 transition-opacity"
              >
                {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
              </button>
            ) : (
              <div className="w-8" />
            )}
          </div>

          {/* Center: Logo */}
          <div className="flex-1 flex justify-center">
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

          {/* Right: Login button (when not authenticated) */}
          <div className="flex-shrink-0 w-8">
            {!authenticated && (
              <button
                onClick={() => showLoginModal()}
                className="px-3 py-1.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Login
              </button>
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

