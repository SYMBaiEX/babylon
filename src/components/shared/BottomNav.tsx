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
      color: '#1c9cf0', // Blue
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Game',
      href: '/game',
      icon: PlayCircle,
      color: '#10b981', // Emerald
      active: pathname === '/game',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      color: '#f59e0b', // Amber
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: '#b82323', // Red
      active: pathname === '/chats',
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      color: '#8b5cf6', // Purple
      active: pathname === '/profile' || pathname?.startsWith('/profile/'),
    },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .neumorphic-nav-container {
            box-shadow: 10px 10px 20px rgba(0, 0, 0, 0.15), -10px -10px 20px rgba(255, 255, 255, 0.05);
          }

          .neumorphic-nav-button {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-nav-button:hover {
            box-shadow: none;
          }
        `
      }} />
      <nav className={cn(
        'fixed bottom-4 left-4 right-4 z-50 md:hidden',
        'bg-sidebar/95 backdrop-blur-md',
        'neumorphic-nav-container rounded-2xl p-1'
      )}>
        {/* Navigation Items */}
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'neumorphic-nav-button flex items-center justify-center w-14 h-14 m-1 rounded-xl cursor-pointer',
                  'transition-all duration-300',
                  !item.active && 'bg-sidebar-accent/30'
                )}
                aria-label={item.name}
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
                    'w-6 h-6 transition-colors duration-300',
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
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
