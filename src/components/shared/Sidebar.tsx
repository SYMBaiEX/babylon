'use client'

import { LoginButton } from '@/components/auth/LoginButton'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { Home, MessageCircle, TrendingUp, User, LogOut } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

export function Sidebar() {
  const pathname = usePathname()
  const { ready, authenticated, logout } = useAuth()
  const { user } = useAuthStore()
  const [showLogoutMenu, setShowLogoutMenu] = useState(false)

  const allNavItems = [
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
      requiresAuth: true,
    }
  ]

  const navItems = allNavItems.filter(item => !item.requiresAuth || authenticated)
  
  const isOnFeed = pathname === '/feed' || pathname === '/'
  const showLoginInSidebar = !isOnFeed

  return (
    <aside
      className={cn(
        'hidden md:flex md:flex-col h-screen sticky top-0',
        'bg-sidebar',
        'md:w-64 lg:w-72'
      )}
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-center">
        <Link
          href="/feed"
          className="hover:scale-105 transition-transform duration-300"
        >
          <Image
            src="/assets/logos/logo.svg"
            alt="Babylon Logo"
            width={32}
            height={32}
            className="flex-shrink-0 w-8 h-8"
          />
        </Link>
      </div>

      {/* Authentication Section at Top (only show if not on feed) */}
      {!authenticated && showLoginInSidebar && (
        <div className="px-6 pb-4">
          {!ready ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Loading auth...
            </div>
          ) : (
            <LoginButton />
          )}
        </div>
      )}

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
              style={item.active ? { color: '#1c9cf0' } : undefined}
            >
              {/* Icon */}
              <Icon
                className="w-6 h-6 transition-all duration-300 group-hover:scale-110"
                style={item.active ? { color: '#1c9cf0' } : undefined}
              />

              {/* Label */}
              <span className="text-lg">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      {authenticated && ready && (
        <div
          className="p-4"
          style={{ borderTop: '1px solid #1c9cf0' }}
        >
          {/* User Profile Section at Bottom */}
          <div className="relative">
            <button
              onClick={() => setShowLogoutMenu(!showLogoutMenu)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-sidebar-accent transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-foreground truncate text-sm">
                  {user?.displayName || 'Anonymous'}
                </p>
              </div>
            </button>

            {/* Logout Menu */}
            {showLogoutMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-sidebar-accent rounded-lg shadow-lg border-2 overflow-hidden"
                style={{ borderColor: '#1c9cf0' }}
              >
                <button
                  onClick={() => {
                    logout()
                    setShowLogoutMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
