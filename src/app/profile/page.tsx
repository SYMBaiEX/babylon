'use client'

import { User, Calendar } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { cn } from '@/lib/utils'

export default function ProfilePage() {
  const { ready, authenticated } = useAuth()
  const { user } = useAuthStore()

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Profile</h1>
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Authentication Section - Top of mobile profile */}
        {ready && !authenticated && (
          <div className="bg-muted/50 border-b border-border p-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1 text-foreground">Connect Your Wallet</h3>
                  <p className="text-xs text-muted-foreground">
                    View your profile and make predictions
                  </p>
                </div>
                <LoginButton />
              </div>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          {/* Profile Header */}
          <div className="p-4">
            <div className="flex items-start gap-4">
              <div className={cn(
                'w-16 h-16 md:w-20 md:h-20 rounded-full',
                'bg-primary/20 flex items-center justify-center flex-shrink-0'
              )}>
                <User className="w-8 h-8 md:w-10 md:h-10 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl md:text-2xl font-bold truncate text-foreground">
                  {authenticated && user?.displayName ? user.displayName : 'Your Profile'}
                </h2>
                <p className="text-sm text-muted-foreground truncate">
                  {authenticated && user?.walletAddress
                    ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
                    : '@username'}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs md:text-sm text-muted-foreground">
                  <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                  <span>Joined October 2025</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-4 md:gap-6 mt-4 text-sm border-t border-border pt-4">
              <div>
                <span className="font-bold text-foreground">0</span>
                <span className="text-muted-foreground ml-1 text-xs md:text-sm">Following</span>
              </div>
              <div>
                <span className="font-bold text-foreground">0</span>
                <span className="text-muted-foreground ml-1 text-xs md:text-sm">Followers</span>
              </div>
              <div>
                <span className="font-bold text-foreground">0</span>
                <span className="text-muted-foreground ml-1 text-xs md:text-sm">Posts</span>
              </div>
            </div>
          </div>

          {/* Account Management Section - Desktop Only */}
          {ready && authenticated && (
            <div className="hidden md:block px-4 pb-4">
              <UserMenu />
            </div>
          )}

          {/* Posts section */}
          <div className="border-t border-border mt-4">
            <div className="text-center text-muted-foreground py-12 px-4">
              <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{authenticated ? 'Your posts will appear here' : 'Connect your wallet to see your posts'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
