'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, PlayCircle, TrendingUp, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()

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
    <nav
      className={cn(
        'fixed bottom-4 left-4 right-4 z-50 md:hidden',
        'bg-sidebar/95 backdrop-blur-md border-2',
        'rounded-xl shadow-2xl',
        'transition-all duration-300'
      )}
      style={{ borderColor: '#1c9cf0' }}
    >
      {/* Navigation Items */}
      <div className="relative flex justify-around items-center h-12 px-2 py-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center justify-center',
                'transition-all duration-300',
                'w-10 h-10 rounded-md',
                item.active && 'bg-sidebar-accent/80'
              )}
              aria-label={item.name}
            >
              {/* Icon */}
              <Icon
                className={cn(
                  'w-6 h-6 transition-all duration-300',
                  'group-hover:scale-110',
                  item.active
                    ? 'text-sidebar-primary scale-105'
                    : 'text-sidebar-foreground group-hover:text-sidebar-primary'
                )}
                style={item.active ? { color: '#1c9cf0' } : undefined}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
