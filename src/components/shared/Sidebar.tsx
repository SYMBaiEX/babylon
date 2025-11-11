'use client'

import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { Avatar } from '@/components/shared/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Bell, Check, Copy, Gift, Home, LogOut, MessageCircle, Shield, TrendingUp, Trophy, User, Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

function SidebarContent() {
  const [showMdMenu, setShowMdMenu] = useState(false)
  const [copiedReferral, setCopiedReferral] = useState(false)
  const mdMenuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { ready, authenticated, user, logout } = useAuth()

  // Check if dev mode is enabled via URL parameter
  const isDevMode = searchParams.get('dev') === 'true'
  
  // Hide sidebar on production (babylon.market) on home page unless ?dev=true
  const isProduction = typeof window !== 'undefined' && window.location.hostname === 'babylon.market'
  const isHomePage = pathname === '/'
  const shouldHideSidebar = isProduction && isHomePage && !isDevMode

  // Check if user is admin from the user object
  const isAdmin = user?.isAdmin ?? false

  // All hooks must be called before any conditional returns
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mdMenuRef.current && !mdMenuRef.current.contains(event.target as Node)) {
        setShowMdMenu(false)
      }
    }

    if (showMdMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [showMdMenu])

  const copyReferralCode = async () => {
    if (!user?.referralCode) return
    
    try {
      await navigator.clipboard.writeText(user.referralCode)
      setCopiedReferral(true)
      setTimeout(() => setCopiedReferral(false), 2000)
    } catch (err) {
      console.error('Failed to copy referral code:', err)
    }
  }

  // Render nothing if sidebar should be hidden (after all hooks)
  if (shouldHideSidebar) {
    return null
  }

  const navItems = [
    {
      name: 'Home',
      href: '/feed',
      icon: Home,
      color: '#0066FF',
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Explore',
      href: '/explore',
      icon: Search,
      color: '#0066FF',
      active: pathname === '/explore' || pathname?.startsWith('/explore'),
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
      <div className="px-3 py-2 flex items-center justify-center lg:justify-start">
        <Link
          href="/feed"
          className="hover:opacity-80 transition-opacity"
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
      <nav className="flex-1 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center',
                'px-3 py-2.5',
                'rounded-full',
                'transition-colors duration-200',
                'md:justify-center lg:justify-start',
                'gap-3',
                item.active 
                  ? 'bg-sidebar-accent' 
                  : 'hover:bg-sidebar-accent/50'
              )}
              title={item.name}
            >
              {/* Icon */}
              <Icon
                className={cn(
                  'w-6 h-6 shrink-0',
                  'transition-colors duration-200',
                  item.active 
                    ? 'text-sidebar-accent-foreground' 
                    : 'text-sidebar-foreground group-hover:text-sidebar-accent-foreground'
                )}
              />

              {/* Label - hidden on tablet (md), shown on desktop (lg+) */}
              <span
                className={cn(
                  'hidden lg:block',
                  'text-[15px] leading-5',
                  'transition-colors duration-200',
                  item.active 
                    ? 'font-semibold text-sidebar-accent-foreground' 
                    : 'font-normal text-sidebar-foreground group-hover:text-sidebar-accent-foreground'
                )}
              >
                {item.name}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section - Authentication (Desktop lg+) */}
      <div className="hidden lg:block px-2 py-2">
        {!ready ? (
          // Skeleton loader while authentication is initializing
          <div className="flex items-center gap-3 px-3 py-2 animate-pulse">
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

      {/* Bottom Section - User Icon (Tablet md) */}
      {authenticated && user && (
        <div className="md:block lg:hidden relative" ref={mdMenuRef}>
          <div className="px-2 py-2 flex justify-center">
            <button
              onClick={() => setShowMdMenu(!showMdMenu)}
              className="hover:opacity-80 transition-opacity rounded-full"
              aria-label="Open user menu"
            >
              <Avatar 
                id={user.id} 
                name={user.displayName || user.email || 'User'} 
                type="user"
                size="md"
                src={user.profileImageUrl || undefined}
                imageUrl={user.profileImageUrl || undefined}
              />
            </button>
          </div>

          {/* Dropdown Menu - Icon Only */}
          {showMdMenu && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-auto bg-sidebar border border-sidebar-border rounded-lg shadow-lg overflow-hidden z-50">
              {/* Referral Code */}
              {user.referralCode && (
                <button
                  onClick={copyReferralCode}
                  className="w-full flex items-center justify-center p-3 hover:bg-sidebar-accent transition-colors"
                  title={copiedReferral ? "Copied!" : "Copy Referral Link"}
                  aria-label={copiedReferral ? "Copied!" : "Copy Referral Link"}
                >
                  {copiedReferral ? (
                    <Check className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <Copy className="w-5 h-5 text-sidebar-foreground shrink-0" />
                  )}
                </button>
              )}
              
              {/* Separator */}
              {user.referralCode && <div className="border-t border-sidebar-border" />}
              
              {/* Logout */}
              <button
                onClick={() => {
                  setShowMdMenu(false)
                  logout()
                }}
                className="w-full flex items-center justify-center p-3 hover:bg-destructive/10 transition-colors text-destructive"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5 shrink-0" />
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
    </>
  )
}

export function Sidebar() {
  return (
    <Suspense fallback={null}>
      <SidebarContent />
    </Suspense>
  )
}
