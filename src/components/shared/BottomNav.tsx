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
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pb-4 safe-area-inset-bottom">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl',
          'bg-sidebar border border-sidebar-border',
          'shadow-lg',
          'transition-all duration-300'
        )}
      >
        {/* Navigation Items */}
        <div className="relative flex justify-around items-center h-14 px-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group relative flex flex-col items-center justify-center flex-1 h-full',
                  'transition-all duration-300',
                  'rounded-lg',
                  item.active && 'bg-sidebar-accent'
                )}
              >
                {/* Icon container */}
                <div
                  className={cn(
                    'relative mb-0.5 transition-all duration-300',
                    'group-hover:scale-110',
                    item.active && 'scale-105'
                  )}
                >
                  <Icon
                    className={cn(
                      'w-5 h-5 transition-all duration-300',
                      item.active
                        ? 'text-sidebar-primary'
                        : 'text-sidebar-foreground group-hover:text-sidebar-primary'
                    )}
                  />
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-[10px] font-medium transition-all duration-300',
                    item.active
                      ? 'text-sidebar-primary font-semibold'
                      : 'text-sidebar-foreground group-hover:text-sidebar-primary'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
