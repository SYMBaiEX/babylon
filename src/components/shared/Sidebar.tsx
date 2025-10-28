'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, User, PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react'
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
  ]

  return (
    <aside
      className={cn(
        'hidden md:flex md:flex-col h-screen sticky top-0',
        'bg-sidebar border-r border-sidebar-border',
        'transition-all duration-300',
        isCollapsed ? 'md:w-20' : 'md:w-64 lg:w-72'
      )}
    >
      {/* Header */}
      <div className={cn(
        'p-6 flex items-center',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {!isCollapsed && (
          <Link
            href="/feed"
            className={cn(
              'text-2xl font-bold',
              'bg-gradient-to-br from-sidebar-primary to-primary',
              'bg-clip-text text-transparent',
              'hover:scale-105 transition-transform duration-300 inline-block'
            )}
          >
            Babylon
          </Link>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'p-2 rounded-lg',
            'hover:bg-sidebar-accent',
            'text-sidebar-foreground hover:text-sidebar-primary',
            'transition-all duration-300'
          )}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
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
                'group relative flex items-center gap-4 px-4 py-3 rounded-xl',
                'transition-all duration-300',
                isCollapsed && 'justify-center',
                item.active
                  ? [
                      'bg-sidebar-accent',
                      'text-sidebar-primary font-semibold',
                    ]
                  : [
                      'text-sidebar-foreground hover:bg-sidebar-accent/50',
                      'hover:text-sidebar-primary',
                    ]
              )}
              title={isCollapsed ? item.name : undefined}
            >
              {/* Icon */}
              <Icon
                className={cn(
                  'w-6 h-6 transition-all duration-300',
                  'group-hover:scale-110',
                  isCollapsed ? 'flex-shrink-0' : ''
                )}
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
        className={cn(
          'p-4 space-y-4',
          'border-t border-sidebar-border'
        )}
      >
        {/* Theme Toggle */}
        {!isCollapsed && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-sidebar-foreground">Theme</span>
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
              'bg-sidebar-accent',
              'border border-sidebar-border'
            )}
          >
            <p className="font-semibold text-sidebar-foreground mb-1">Game Status</p>
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
