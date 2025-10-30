'use client'

import { useState } from 'react'
import { User as UserIcon, Copy, Check, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { Separator } from '@/components/shared/Separator'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const { logout } = useAuth()
  const { user, wallet } = useAuthStore()
  const [copied, setCopied] = useState(false)

  const handleCopyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .neumorphic-user-menu {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
          }

          .neumorphic-user-button {
            box-shadow: inset 3px 3px 3px rgba(0, 0, 0, 0.1), inset -3px -3px 3px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-user-button:hover {
            box-shadow: none;
          }
        `
      }} />
      <div className={cn(
        'bg-sidebar-accent/30 rounded-xl p-4 space-y-4',
        'neumorphic-user-menu'
      )}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-sidebar-accent/50 flex items-center justify-center neumorphic-user-button">
            <UserIcon className="w-6 h-6" style={{ color: '#1c9cf0' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Account
            </p>
            <p className="font-semibold text-foreground truncate">
              {user?.displayName || 'Anonymous'}
            </p>
          </div>
        </div>

        {/* Email Section */}
        {user?.email && (
          <>
            <div className="py-2">
              <Separator />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                Email
              </label>
              <p className="text-sm text-foreground truncate">
                {user.email}
              </p>
            </div>
          </>
        )}

        {/* Wallet Address Section */}
        {wallet?.address && (
          <>
            <div className="py-2">
              <Separator />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                Wallet Address
              </label>
              <button
                onClick={handleCopyAddress}
                className={cn(
                  'flex items-center gap-2 text-sm font-mono px-3 py-2 rounded-lg',
                  'bg-sidebar-accent/30 neumorphic-user-button',
                  'transition-all duration-300'
                )}
                style={{ color: '#1c9cf0' }}
              >
                <span>{formatAddress(wallet.address)}</span>
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </>
        )}

        {/* Logout Button */}
        <>
          <div className="py-2">
            <Separator />
          </div>
          <div>
            <button
              onClick={logout}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
                'bg-sidebar-accent/30 neumorphic-user-button text-destructive',
                'transition-all duration-300'
              )}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </>
      </div>
    </>
  )
}
