'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Grid3x3, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      color: '#1da1f2', // Classic Twitter blue
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'More',
      href: '/markets',
      icon: Grid3x3,
      color: '#1da1f2',
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: '#1da1f2',
      active: pathname === '/chats',
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      color: '#1da1f2',
      active: pathname === '/profile' || pathname?.startsWith('/profile/'),
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-sidebar border-t border-sidebar-border bottom-nav-rounded">
      {/* Separator line */}
      <div className="h-px bg-sidebar-border" />
      
      {/* Navigation Items */}
      <div className="flex justify-around items-center h-12 px-2 safe-area-bottom">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center justify-center w-12 h-12 transition-colors duration-200',
                'hover:bg-sidebar-accent/50'
              )}
              aria-label={item.name}
            >
              <Icon
                className={cn(
                  'w-6 h-6 transition-colors duration-200',
                  item.active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60'
                )}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
