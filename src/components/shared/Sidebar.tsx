'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, User, PlayCircle, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { useGameStore } from '@/stores/gameStore'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()
  const { ready, authenticated } = useAuth()
  const { isPlaying, allGames } = useGameStore()

  const navItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Game',
      href: '/game',
      icon: PlayCircle,
      active: pathname === '/game',
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
      icon: User,
      active: pathname === '/profile' || pathname?.startsWith('/profile/'),
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      active: pathname === '/settings' || pathname?.startsWith('/settings/'),
    },
  ]

  return (
    <aside
      className={cn(
        'hidden md:flex md:flex-col h-screen sticky top-0',
        'bg-sidebar',
        'transition-all duration-300',
        isCollapsed ? 'md:w-20' : 'md:w-64 lg:w-72'
      )}
    >
      {/* Header */}
      <div className={cn(
        'p-6',
        isCollapsed ? 'flex flex-col items-center gap-4' : 'flex items-center justify-between'
      )}>
        {isCollapsed ? (
          <>
            <Link
              href="/feed"
              className={cn(
                'flex items-center justify-center',
                'hover:scale-105 transition-transform duration-300'
              )}
            >
              <Image
                src="/assets/logos/logo.svg"
                alt="Babylon Logo"
                width={40}
                height={40}
                className="flex-shrink-0 w-10 h-10"
              />
            </Link>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                'p-2 rounded-lg',
                'hover:bg-sidebar-accent',
                'transition-all duration-300'
              )}
              style={{ color: '#1c9cf0' }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            <Link
              href="/feed"
              className={cn(
                'flex items-center gap-3',
                'hover:scale-105 transition-transform duration-300'
              )}
            >
              <Image
                src="/assets/logos/logo.svg"
                alt="Babylon Logo"
                width={32}
                height={32}
                className="flex-shrink-0 w-8 h-8"
              />
              <span
                className={cn(
                  'text-2xl font-bold',
                  'bg-gradient-to-br from-sidebar-primary to-primary',
                  'bg-clip-text text-transparent'
                )}
              >
                Babylon
              </span>
            </Link>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                'p-2 rounded-lg',
                'hover:bg-sidebar-accent',
                'transition-all duration-300'
              )}
              style={{ color: '#1c9cf0' }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-4 px-4 py-3 rounded-lg',
                'transition-all duration-300',
                isCollapsed && 'justify-center',
                item.active
                  ? [
                      'bg-sidebar-accent',
                      'font-semibold',
                    ]
                  : [
                      'text-sidebar-foreground hover:bg-sidebar-accent/50',
                      'hover:text-sidebar-primary',
                    ]
              )}
              title={isCollapsed ? item.name : undefined}
              style={item.active ? { color: '#1c9cf0' } : undefined}
            >
              {/* Icon */}
              <Icon
                className={cn(
                  'w-6 h-6 transition-all duration-300',
                  'group-hover:scale-110',
                  isCollapsed ? 'flex-shrink-0' : ''
                )}
                style={item.active ? { color: '#1c9cf0' } : undefined}
              />

              {/* Label */}
              {!isCollapsed && (
                <span className="text-lg">{item.name}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div
        className="p-4 space-y-4"
        style={{ borderTop: '1px solid #1c9cf0' }}
      >
        {/* Theme Toggle */}
        {!isCollapsed && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: '#1c9cf0' }}>Theme</span>
            <ThemeToggle />
          </div>
        )}

        {isCollapsed && (
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        )}

        {/* Authentication Section */}
        {ready && !isCollapsed && (
          <div>
            {authenticated ? (
              <UserMenu />
            ) : (
              <LoginButton />
            )}
          </div>
        )}

        {/* Game Status */}
        {!isCollapsed && (
          <div
            className={cn(
              'text-sm p-3 rounded-xl',
              'bg-sidebar-accent'
            )}
            style={{ border: '2px solid #1c9cf0' }}
          >
            <p className="font-semibold mb-1" style={{ color: '#1c9cf0' }}>Game Status</p>
            <p className="text-xs text-muted-foreground">
              {allGames.length > 0
                ? (isPlaying ? '▶️ Playing' : '⏸️ Paused')
                : 'No games loaded'}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
