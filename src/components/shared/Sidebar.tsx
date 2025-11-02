'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Home, TrendingUp, MessageCircle, Bell, Trophy, Gift, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { Separator } from '@/components/shared/Separator'
import { CreatePostModal } from '@/components/posts/CreatePostModal'

export function Sidebar() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
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
      name: 'Leaderboard',
      href: '/leaderboard',
      icon: Trophy,
      color: '#1c9cf0', // Yellow/Gold
      active: pathname === '/leaderboard',
    },
    {
      name: 'Referrals',
      href: '/referrals',
      icon: Gift,
      color: '#a855f7', // Purple
      active: pathname === '/referrals',
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
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      color: '#1c9cf0',
      active: pathname === '/notifications',
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
      {/* Header */}
      <div className="p-6 flex items-center justify-center lg:justify-start">
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
            width={32}
            height={32}
            className="flex-shrink-0 w-8 h-8"
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
                  'w-6 h-6 transition-all duration-300 mx-2',
                  'group-hover:scale-110',
                  'flex-shrink-0',
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
                  'text-lg transition-colors duration-300',
                  'hidden lg:block',
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
              "flex items-center justify-center gap-2",
              "bg-[#1c9cf0] hover:bg-[#1a8cd8]",
              "text-white font-semibold",
              "rounded-full",
              "transition-all duration-200",
              "shadow-md hover:shadow-lg",
              "md:w-12 md:h-12 lg:w-full lg:py-3"
            )}
          >
            <Plus className="w-5 h-5" />
            <span className="text-lg hidden lg:inline">Post</span>
          </button>
        </div>
      )}

      {/* Separator */}
      <div className="px-4 py-2">
        <Separator />
      </div>

      {/* Bottom Section */}
      <div className="p-4 space-y-4">
        {/* Authentication Section - hidden on tablet (md), shown on desktop (lg+) */}
        {ready && (
          <div className="hidden lg:block">
            {authenticated ? (
              <UserMenu />
            ) : (
              <LoginButton />
            )}
          </div>
        )}

      </div>
    </aside>

    {/* Create Post Modal */}
    <CreatePostModal
      isOpen={showCreateModal}
      onClose={() => setShowCreateModal(false)}
      onPostCreated={() => {
        // Refresh the page if on feed, otherwise navigate to feed
        if (window.location.pathname === '/feed') {
          window.location.reload()
        } else {
          router.push('/feed')
        }
      }}
    />
    </>
  )
}
