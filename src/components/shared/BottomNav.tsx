'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, Trophy, Gift, Bell, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { getProfileUrl } from '@/lib/profile-utils'

export function BottomNav() {
  const pathname = usePathname()
  const { authenticated, user } = useAuth()

  // Active color for navigation items
  const activeColor = '#1c9cf0'

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
      color: activeColor,
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      color: activeColor,
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: activeColor,
      active: pathname === '/chats',
    },
    {
      name: 'Leaderboards',
      href: '/leaderboard',
      icon: Trophy,
      color: activeColor,
      active: pathname === '/leaderboard',
    },
    {
      name: 'Referrals',
      href: '/referrals',
      icon: Gift,
      color: activeColor,
      active: pathname === '/referrals',
    },
  ]

  const profileItem = {
    name: 'Profile',
    href: profileUrl,
    icon: User,
    color: activeColor,
    active: pathname?.startsWith('/profile'),
  }

  const ProfileIcon = profileItem.icon

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-sidebar border-t border-border bottom-nav-rounded">
      {/* Navigation Items */}
      <div className="flex justify-between items-center h-14 px-4 safe-area-bottom">
        <div className="flex justify-around items-center flex-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center justify-center w-12 h-12 rounded-lg transition-colors duration-200',
                  'hover:bg-sidebar-accent/50'
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
              </Link>
            )
          })}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Notifications Button */}
          {authenticated && (
            <Link
              href="/notifications"
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-lg transition-colors duration-200',
                'hover:bg-sidebar-accent/50'
              )}
              aria-label="Notifications"
            >
              <Bell
                className={cn(
                  'w-6 h-6 transition-colors duration-200',
                  pathname === '/notifications' ? 'text-sidebar-primary' : 'text-sidebar-foreground'
                )}
                style={{
                  color: pathname === '/notifications' ? activeColor : undefined,
                }}
              />
            </Link>
          )}
          
          {/* Profile Button - All the way to the right */}
          <Link
            href={profileItem.href}
            className={cn(
              'flex items-center justify-center w-12 h-12 rounded-lg transition-colors duration-200',
              'hover:bg-sidebar-accent/50'
            )}
            aria-label={profileItem.name}
          >
            <ProfileIcon
              className={cn(
                'w-6 h-6 transition-colors duration-200',
                profileItem.active ? 'text-sidebar-primary' : 'text-sidebar-foreground'
              )}
              style={{
                color: profileItem.active ? profileItem.color : undefined,
              }}
            />
          </Link>
        </div>
      </div>
    </nav>
  )
}
