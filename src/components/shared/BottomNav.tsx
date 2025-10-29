'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, User } from 'lucide-react'
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
        'bg-sidebar/95 backdrop-blur-md border-2 border-border',
        'rounded-2xl shadow-2xl',
        'transition-all duration-300'
      )}
    >
      {/* Navigation Items */}
      <div className="relative flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex flex-col items-center justify-center flex-1 h-full',
                'transition-all duration-300',
                'rounded-xl',
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
    </nav>
  )
}
