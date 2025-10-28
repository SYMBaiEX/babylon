'use client'

import { useState } from 'react'
import { LogOut, User, Copy, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'

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
    <div className="bg-sidebar-accent rounded-xl p-4 space-y-4" style={{ border: '2px solid #1c9cf0' }}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="w-6 h-6 text-primary" />
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
        <div className="pt-3" style={{ borderTop: '1px solid #1c9cf0' }}>
          <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
            Email
          </label>
          <p className="text-sm text-foreground truncate">
            {user.email}
          </p>
        </div>
      )}

      {/* Wallet Address Section */}
      {wallet?.address && (
        <div className="pt-3" style={{ borderTop: '1px solid #1c9cf0' }}>
          <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
            Wallet Address
          </label>
          <button
            onClick={handleCopyAddress}
            className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity font-mono"
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
      )}
    </div>
  )
}
