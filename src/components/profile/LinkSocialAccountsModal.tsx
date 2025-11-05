'use client'

import { useState } from 'react'
import { X as XIcon, Check, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

interface LinkSocialAccountsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LinkSocialAccountsModal({ isOpen, onClose }: LinkSocialAccountsModalProps) {
  const { user, setUser } = useAuthStore()
  const [linking, setLinking] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState({
    twitter: '',
    farcaster: '',
  })

  if (!isOpen) return null

  const handleLinkAccount = async (platform: 'twitter' | 'farcaster') => {
    if (!user?.id) return
    
    const username = inputValues[platform].trim()
    if (!username) {
      toast.error('Please enter a username')
      return
    }

    setLinking(platform)

    const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/link-social`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        platform,
        username,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to link account' }))
      setLinking(null)
      throw new Error(error.error || 'Failed to link account')
    }

    const data = await response.json()

    // Update user in store
    const updates = {
      ...user,
      ...(platform === 'twitter' 
        ? { hasTwitter: true, twitterUsername: username }
        : { hasFarcaster: true, farcasterUsername: username }
      ),
      // Add points if awarded
      ...(data.points?.awarded ? { reputationPoints: data.points.newTotal } : {}),
    }

    if (data.points?.awarded) {
      toast.success(`Account linked! +${data.points.awarded} points awarded`)
    } else {
      toast.success('Account linked successfully!')
    }

    setUser(updates)

    // Clear input
    setInputValues(prev => ({ ...prev, [platform]: '' }))
    setLinking(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl max-w-md w-full border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">Link Social Accounts</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Twitter/X */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <h3 className="font-semibold">Twitter / X</h3>
              {user?.hasTwitter && (
                <span className="ml-auto flex items-center gap-1 text-sm text-green-500">
                  <Check className="w-4 h-4" />
                  Linked
                </span>
              )}
            </div>

            {user?.hasTwitter ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <span className="text-sm">@{user.twitterUsername}</span>
                <a
                  href={`https://twitter.com/${user.twitterUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-primary hover:text-primary/80"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter your Twitter username"
                  value={inputValues.twitter}
                  onChange={(e) => setInputValues(prev => ({ ...prev, twitter: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLinkAccount('twitter')
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-sidebar-accent/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={linking === 'twitter'}
                />
                <button
                  onClick={() => handleLinkAccount('twitter')}
                  disabled={linking === 'twitter' || !inputValues.twitter.trim()}
                  className={cn(
                    'w-full px-4 py-2 rounded-lg font-semibold transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {linking === 'twitter' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Linking...</span>
                    </>
                  ) : (
                    'Link Twitter Account'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Farcaster */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 1000 1000" fill="currentColor">
                <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z"/>
                <path d="M128.889 253.333L157.778 351.111H182.222V844.444H128.889V253.333Z"/>
                <path d="M871.111 253.333L842.222 351.111H817.778V844.444H871.111V253.333Z"/>
              </svg>
              <h3 className="font-semibold">Farcaster</h3>
              {user?.hasFarcaster && (
                <span className="ml-auto flex items-center gap-1 text-sm text-green-500">
                  <Check className="w-4 h-4" />
                  Linked
                </span>
              )}
            </div>

            {user?.hasFarcaster ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <span className="text-sm">@{user.farcasterUsername}</span>
                <a
                  href={`https://warpcast.com/${user.farcasterUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-primary hover:text-primary/80"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter your Farcaster username"
                  value={inputValues.farcaster}
                  onChange={(e) => setInputValues(prev => ({ ...prev, farcaster: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLinkAccount('farcaster')
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-sidebar-accent/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={linking === 'farcaster'}
                />
                <button
                  onClick={() => handleLinkAccount('farcaster')}
                  disabled={linking === 'farcaster' || !inputValues.farcaster.trim()}
                  className={cn(
                    'w-full px-4 py-2 rounded-lg font-semibold transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {linking === 'farcaster' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Linking...</span>
                    </>
                  ) : (
                    'Link Farcaster Account'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">
              Linking your social accounts helps verify your identity and may earn you reputation points!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-muted hover:bg-muted/70 font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

