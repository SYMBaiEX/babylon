'use client'

import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { CreatePostModal } from '@/components/posts/CreatePostModal'
import { Separator } from '@/components/shared/Separator'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Bell, Gift, Home, MessageCircle, Plus, Shield, TrendingUp, Trophy, User } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function Sidebar() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { ready, authenticated, user } = useAuth()

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!authenticated) {
        setIsAdmin(false)
        return
      }

      try {
        const response = await fetch('/api/admin/stats')
        setIsAdmin(response.ok)
      } catch {
        setIsAdmin(false)
      }
    }

    checkAdmin()
  }, [authenticated, user])

  const navItems = [
    {
      name: 'Home',
      href: '/feed',
      icon: Home,
      color: '#0066FF',
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      color: '#0066FF',
      active: pathname === '/notifications',
    },
    {
      name: 'Leaderboard',
      href: '/leaderboard',
      icon: Trophy,
      color: '#0066FF',
      active: pathname === '/leaderboard',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      color: '#0066FF',
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: '#0066FF',
      active: pathname === '/chats',
    },
    {
      name: 'Rewards',
      href: '/rewards',
      icon: Gift,
      color: '#a855f7',
      active: pathname === '/rewards',
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      color: '#0066FF',
      active: pathname === '/profile',
    },
    // Admin link (only shown for admins)
    ...(isAdmin ? [{
      name: 'Admin',
      href: '/admin',
      icon: Shield,
      color: '#f97316',
      active: pathname === '/admin',
    }] : []),
  ]

  return (
    <>
      {/* Responsive sidebar: icons only on tablet (md), icons + names on desktop (lg+) */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col h-screen sticky top-0',
          'bg-sidebar',
          'transition-all duration-300',
          'md:w-20 lg:w-64'
        )}
      >
      {/* Header - Logo */}
      <div className="p-6 flex items-center justify-center lg:justify-start">
        <Link
          href="/feed"
          className="hover:scale-105 transition-transform duration-300"
        >
          {/* Icon-only logo for md (tablet) */}
          <Image
            src="/assets/logos/logo.svg"
            alt="Babylon Logo"
            width={32}
            height={32}
            className="w-8 h-8 lg:hidden"
          />
          {/* Full logo with text for lg+ (desktop) */}
          <Image
            src="/assets/logos/logo_full.svg"
            alt="Babylon"
            width={160}
            height={38}
            className="hidden lg:block h-8 w-auto"
          />
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

      {/* Post Button */}
      {authenticated && (
        <div className="px-4 py-3 flex justify-center lg:justify-start">
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              'flex items-center justify-center gap-2',
              'bg-[#0066FF] hover:bg-[#2952d9]',
              'text-white font-semibold',
              'rounded-full',
              'transition-all duration-200',
              'shadow-md hover:shadow-lg',
              'md:w-12 md:h-12 lg:w-full lg:py-3'
            )}
          >
            <Plus className="w-5 h-5" />
            <span className="text-lg hidden lg:inline">Post</span>
          </button>
        </div>
      )}

      {/* Separator - only shown on desktop */}
      <div className="hidden lg:block px-4 py-2">
        <Separator />
      </div>

      {/* Bottom Section - Authentication */}
      <div className="hidden lg:block p-4">
        {!ready ? (
          // Skeleton loader while authentication is initializing
          <div className="flex items-center gap-3 p-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent/50" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 bg-sidebar-accent/50 rounded w-24" />
              <div className="h-3 bg-sidebar-accent/30 rounded w-16" />
            </div>
          </div>
        ) : authenticated ? (
          <UserMenu />
        ) : (
          <LoginButton />
        )}
      </div>
    </aside>

    {/* Create Post Modal */}
    <CreatePostModal
      isOpen={showCreateModal}
      onClose={() => setShowCreateModal(false)}
      onPostCreated={() => {
        // Refresh the page if on feed, otherwise navigate to feed
        if (pathname === '/feed') {
          window.location.reload()
        } else {
          router.push('/feed')
        }
      }}
    />
    </>
  )
}
