'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModal } from '@/hooks/useLoginModal'
import { NotificationsButton } from '@/components/shared/NotificationsButton'
import { CreatePostModal } from '@/components/posts/CreatePostModal'
import { useRouter, usePathname } from 'next/navigation'

export function MobileHeader() {
  const { authenticated } = useAuth()
  useAuthStore()
  const { showLoginModal } = useLoginModal()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  
  // Hide certain elements on profile page
  const isProfilePage = pathname === '/profile'

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
          {/* Left: Logo (hidden on profile page) */}
          {!isProfilePage && (
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
          )}

          {/* Profile page: show page title */}
          {isProfilePage && (
            <h1 className="text-lg font-bold text-foreground">Profile</h1>
          )}

          {/* Right side: Notifications, Login (hide on profile page when authenticated) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {authenticated ? (
              <>
                {!isProfilePage && (
                  <>
                    <NotificationsButton />
                  </>
                )}
              </>
            ) : (
              <button
                onClick={() => showLoginModal()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

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
          </div>
        </>
      )}

      {/* Floating Post Button (Mobile) */}
      {authenticated && !isProfilePage && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-[#1c9cf0] hover:bg-[#1a8cd8] text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
          aria-label="Create post"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </>
  )
}
