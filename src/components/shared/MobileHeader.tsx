'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { User as UserIcon, LogOut, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModal } from '@/hooks/useLoginModal'
import { PointsTracker } from '@/components/shared/PointsTracker'
import { NotificationsButton } from '@/components/shared/NotificationsButton'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

export function MobileHeader() {
  const { authenticated, logout } = useAuth()
  useAuthStore()
  const { showLoginModal } = useLoginModal()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    setShowUserMenu(false)
    await logout()
  }

  return (
    <>
      <header
        className={cn(
          'md:hidden',
          'fixed top-0 left-0 right-0 z-40',
          'bg-sidebar/95',
          'border-b',
          'transition-all duration-300'
        )}
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between h-14 px-4 relative">
          {/* Left: Logo */}
          <Link
            href="/feed"
            className={cn(
              'flex items-center gap-3',
              'hover:scale-105 transition-transform duration-300',
              'flex-shrink-0'
            )}
          >
            <Image
              src="/assets/logos/logo.svg"
              alt="Babylon Logo"
              width={28}
              height={28}
              className="flex-shrink-0 w-7 h-7"
            />
          </Link>

          {/* Center: Points Tracker */}
          <div className="absolute left-1/2 transform -translate-x-1/2">
            <PointsTracker showIcon={true} />
          </div>

          {/* Right side: Notifications, Login/User Menu, and Theme Toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {authenticated ? (
              <>
                <NotificationsButton />
                <button
                  onClick={() => setShowUserMenu(true)}
                  className="p-2 hover:bg-sidebar-accent transition-colors rounded-full"
                  aria-label="User menu"
                >
                  <UserIcon className="w-5 h-5 text-sidebar-foreground" />
                </button>
              </>
            ) : (
              <button
                onClick={() => showLoginModal()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Login
              </button>
            )}
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      {/* User Menu Modal (Mobile) */}
      {showUserMenu && authenticated && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setShowUserMenu(false)}
          />

          {/* Menu Panel */}
          <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-popover border-t-2 border-border rounded-t-2xl p-6 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Account</h3>
              <button
                onClick={() => setShowUserMenu(false)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* User Info */}
            <div className="space-y-4">
              <Link
                href="/profile"
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                onClick={() => setShowUserMenu(false)}
              >
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <UserIcon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    My Profile
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    View and edit your profile
                  </p>
                </div>
              </Link>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors font-medium"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
