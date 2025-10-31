'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, User, Settings, ChevronLeft, ChevronRight, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Separator } from '@/components/shared/Separator'
// NotificationsButton import removed - unused

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()
  const { ready, authenticated } = useAuth()

  const navItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      color: '#1c9cf0', // Blue
      active: pathname === '/feed' || pathname === '/',
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
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      color: '#1c9cf0', // Blue
      active: pathname === '/notifications',
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      color: '#8b5cf6', // Purple
      active: pathname === '/profile' || pathname?.startsWith('/profile/'),
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      color: '#64748b', // Slate
      active: pathname === '/settings' || pathname?.startsWith('/settings/'),
    },
  ]

  return (
    <>
      {/* Early 2000s Twitter: Simple, clean sidebar without neumorphic effects */}
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
                'p-2',
                'hover:bg-sidebar-accent',
                'transition-colors duration-200',
                'text-sidebar-primary'
              )}
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
                'p-2',
                'hover:bg-sidebar-accent',
                'transition-colors duration-200',
                'text-sidebar-primary'
              )}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-4 px-4 py-3',
                'transition-colors duration-200',
                isCollapsed && 'justify-center',
                !item.active && 'bg-transparent hover:bg-sidebar-accent'
              )}
              title={isCollapsed ? item.name : undefined}
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
                  'w-6 h-6 transition-all duration-300',
                  'group-hover:scale-110',
                  isCollapsed ? 'flex-shrink-0' : '',
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

              {/* Label */}
              {!isCollapsed && (
                <span
                  className={cn(
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
              )}
            </Link>
          )
        })}
      </nav>

      {/* Separator */}
      <div className="px-4 py-2">
        <Separator />
      </div>

      {/* Bottom Section */}
      <div className="p-4 space-y-4">
        {/* Theme Toggle */}
        {!isCollapsed && (
          <div
            className={cn(
              'flex items-center justify-between p-3',
              'bg-sidebar-accent',
              'transition-colors duration-200'
            )}
          >
            <span className="text-sm font-medium text-sidebar-primary">Theme</span>
            <ThemeToggle />
          </div>
        )}

        {isCollapsed && (
          <div className="flex justify-center">
            <ThemeToggle compact />
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

      </div>
    </aside>
    </>
  )
}
