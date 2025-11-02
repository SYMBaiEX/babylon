'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, Bell, Trophy, Gift, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { LoginButton } from '@/components/auth/LoginButton'
import { Separator } from '@/components/shared/Separator'
import { UserPointsDisplay } from './UserPointsDisplay'
import { getProfileUrl } from '@/lib/profile-utils'

export function Sidebar() {
  const pathname = usePathname()
  const { ready, authenticated, user } = useAuth()

  // Memoize profile URL to ensure it always uses the latest username
  const profileUrl = useMemo(() => {
    if (authenticated && user) {
      return getProfileUrl(user.id, user.username)
    }
    return '/profile'
  }, [authenticated, user?.id, user?.username])

  const navItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      color: '#1c9cf0',
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      color: '#1c9cf0',
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: '#1c9cf0',
      active: pathname === '/chats',
    },
    {
      name: 'Leaderboards',
      href: '/leaderboard',
      icon: Trophy,
      color: '#1c9cf0',
      active: pathname === '/leaderboard',
    },
    {
      name: 'Referrals',
      href: '/referrals',
      icon: Gift,
      color: '#1c9cf0',
      active: pathname === '/referrals',
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      color: '#1c9cf0',
      active: pathname === '/notifications',
    },
    {
      name: 'Profile',
      href: profileUrl,
      icon: User,
      color: '#1c9cf0',
      active: pathname?.startsWith('/profile'),
    },
  ]

  return (
    <>
      {/* Responsive sidebar: icons only on tablet (md), icons + names on desktop (lg+) */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col h-screen sticky top-0',
          'bg-sidebar',
          'transition-all duration-300',
          'md:w-20 lg:w-64 xl:w-72'
        )}
      >
      {/* Header - Logo */}
      <div className="p-6 flex items-center justify-center lg:justify-start">
        <Link
          href="/feed"
          className="flex items-center gap-3 hover:scale-105 transition-transform duration-300"
        >
          <Image
            src="/assets/logos/logo.svg"
            alt="Babylon Logo"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className="hidden lg:block text-xl font-bold" style={{ color: '#1c9cf0' }}>
            Babylon
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center px-4 py-3',
                'transition-colors duration-200',
                'md:justify-center lg:justify-start',
                !item.active && 'bg-transparent hover:bg-sidebar-accent'
              )}
              title={item.name}
              style={{
                backgroundColor: item.active ? item.color : undefined,
              }}
              onMouseEnter={(e) => {
                if (!item.active) {
                  e.currentTarget.style.backgroundColor = item.color
                }
              }}
              onMouseLeave={(e) => {
                if (!item.active) {
                  e.currentTarget.style.backgroundColor = ''
                }
              }}
            >
              {/* Icon */}
              <Icon
                className={cn(
                  'w-6 h-6 flex-shrink-0',
                  'transition-all duration-300',
                  'group-hover:scale-110',
                  'lg:mr-3',
                  !item.active && 'text-sidebar-foreground'
                )}
                style={{
                  color: item.active ? '#e4e4e4' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!item.active) {
                    e.currentTarget.style.color = '#e4e4e4'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.active) {
                    e.currentTarget.style.color = ''
                  }
                }}
              />

              {/* Label - hidden on tablet (md), shown on desktop (lg+) */}
              <span
                className={cn(
                  'hidden lg:block',
                  'text-lg transition-colors duration-300',
                  item.active ? 'font-semibold' : 'text-sidebar-foreground'
                )}
                style={{
                  color: item.active ? '#e4e4e4' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!item.active) {
                    e.currentTarget.style.color = '#e4e4e4'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.active) {
                    e.currentTarget.style.color = ''
                  }
                }}
              >
                {item.name}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Separator - only shown on desktop when auth section is visible */}
      {ready && (
        <div className="hidden lg:block px-4 py-2">
          <Separator />
        </div>
      )}

      {/* Bottom Section - Points Display and User Info */}
      {ready && authenticated && (
        <div className="hidden lg:block p-4">
          <UserPointsDisplay />
        </div>
      )}

      {/* Bottom Section - Authentication (if not authenticated) */}
      {ready && !authenticated && (
        <div className="hidden lg:block p-4">
          <LoginButton />
        </div>
      )}
    </aside>
    </>
  )
}
