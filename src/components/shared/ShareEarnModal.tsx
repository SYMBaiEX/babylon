/**
 * Share and earn modal component for sharing content with points rewards.
 * 
 * Provides a modal interface for sharing to Twitter/X and Farcaster with
 * points tracking. Shows share status, earned points, and handles share
 * verification. Checks platform configuration and existing shares on mount.
 * 
 * @example
 * ```tsx
 * <ShareEarnModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   contentType="profile"
 *   contentId="123"
 * />
 * ```
 */

import { useState, useEffect } from 'react'
import { X as XIcon, Twitter, Check, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'
import { ShareVerificationModal } from './ShareVerificationModal'

// Farcaster icon component
function FarcasterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1000 1000" fill="currentColor">
      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z"/>
      <path d="M128.889 253.333L157.778 351.111H182.222V844.444H128.889V253.333Z"/>
      <path d="M871.111 253.333L842.222 351.111H817.778V844.444H871.111V253.333Z"/>
    </svg>
  )
}

interface ShareEarnModalProps {
  isOpen: boolean
  onClose: () => void
  contentType: 'post' | 'profile' | 'market' | 'referral' | 'leaderboard'
  contentId?: string
  url?: string
  text?: string
}

/**
 * Share status tracking for each platform.
 */
interface ShareStatus {
  twitter: { shared: boolean; earned: boolean; loading: boolean; shareId?: string }
  farcaster: { shared: boolean; earned: boolean; loading: boolean; shareId?: string }
}

/**
 * Share and earn modal component.
 * 
 * @param props - ShareEarnModal component props
 * @returns Share and earn modal element or null if not open
 */
export function ShareEarnModal({
  isOpen,
  onClose,
  contentType,
  contentId,
  url,
  text,
}: ShareEarnModalProps) {
  const { authenticated, user } = useAuth()
  const [shareStatus, setShareStatus] = useState<ShareStatus>({
    twitter: { shared: false, earned: false, loading: false },
    farcaster: { shared: false, earned: false, loading: false },
  })
  const [isTwitterConfigured, setIsTwitterConfigured] = useState(true) // Default to true, check on mount
  const [showVerification, setShowVerification] = useState(false)
  const [pendingVerification, setPendingVerification] = useState<{
    shareId: string
    platform: 'twitter' | 'farcaster'
  } | null>(null)
  const [checkingExistingShares, setCheckingExistingShares] = useState(false)

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.origin : '');
  const shareText = text || 'Check this out!'

  // Check configuration and existing shares on mount
  useEffect(() => {
    if (isOpen) {
      checkConfiguration()
      if (authenticated && user) {
        checkExistingShares()
      }
    }
  }, [isOpen, authenticated, user])

  const checkConfiguration = async () => {
    const response = await fetch('/api/auth/credentials/status')
    if (response.ok) {
      const data = await response.json() as { twitter?: boolean; farcaster?: boolean }
      setIsTwitterConfigured(data.twitter || false)
    } else {
      logger.warn('Failed to check credentials status', { status: response.status }, 'ShareEarnModal')
      // Default to true to not block users if check fails
      setIsTwitterConfigured(true)
    }
  }

  const checkExistingShares = async () => {
    if (!user) return

    const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
    if (!token) return

    setCheckingExistingShares(true)

    try {
      // Check for existing verified and earned shares for this content type
      const response = await fetch(
        `/api/users/${encodeURIComponent(user.id)}/share?contentType=${contentType}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        const shares = data.shares || []

        // Update state for each platform that has been verified and earned
        const twitterShare = shares.find((s: { platform: string }) => s.platform === 'twitter')
        const farcasterShare = shares.find((s: { platform: string }) => s.platform === 'farcaster')

        setShareStatus(prev => ({
          twitter: twitterShare
            ? { shared: true, earned: true, loading: false }
            : prev.twitter,
          farcaster: farcasterShare
            ? { shared: true, earned: true, loading: false }
            : prev.farcaster,
        }))

        logger.info(
          `Found ${shares.length} existing verified shares for ${contentType}`,
          { contentType, twitter: !!twitterShare, farcaster: !!farcasterShare },
          'ShareEarnModal'
        )
      }
    } catch (error) {
      logger.warn('Failed to check existing shares', { error }, 'ShareEarnModal')
    } finally {
      setCheckingExistingShares(false)
    }
  }

  const trackShare = async (platform: 'twitter' | 'farcaster'): Promise<{ success: boolean; shareId?: string }> => {
    if (!authenticated || !user) {
      logger.warn('User not authenticated, cannot track share', undefined, 'ShareEarnModal')
      return { success: false }
    }

    const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
    if (!token) {
      logger.warn('No access token available', undefined, 'ShareEarnModal')
      return { success: false }
    }

    const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/share`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform,
        contentType,
        contentId,
        url: shareUrl,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const shareId = data.shareAction?.id
      
      logger.info(
        `Share action created for ${platform}, verification required`,
        { platform, shareId },
        'ShareEarnModal'
      )
      
      return { success: true, shareId }
    }
    
    return { success: false }
  }

  const handleShareToTwitter = async () => {
    if (shareStatus.twitter.loading) return

    // If already earned, just open share window without verification
    if (shareStatus.twitter.earned) {
      const textContainsUrl = shareText.includes(shareUrl)
      const twitterUrl = textContainsUrl
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
        : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
      window.open(twitterUrl, '_blank', 'width=550,height=420')
      return
    }

    setShareStatus(prev => ({
      ...prev,
      twitter: { ...prev.twitter, loading: true }
    }))

    // Check if shareText already contains the URL to avoid duplication
    const textContainsUrl = shareText.includes(shareUrl)
    const twitterUrl = textContainsUrl
      ? `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`
      : `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, '_blank', 'width=550,height=420')
    
    const result = await trackShare('twitter')
    
    // Don't mark as shared yet - only after verification
    setShareStatus(prev => ({
      ...prev,
      twitter: { ...prev.twitter, loading: false, shareId: result.shareId }
    }))

    // Show verification modal after a short delay (gives user time to post)
    if (result.success && result.shareId && user) {
      setTimeout(() => {
        setPendingVerification({ shareId: result.shareId!, platform: 'twitter' })
        setShowVerification(true)
      }, 3000) // 3 second delay
    }
  }

  const handleShareToFarcaster = async () => {
    if (shareStatus.farcaster.loading) return

    // If already earned, just open share window without verification
    if (shareStatus.farcaster.earned) {
      const castText = `${shareText}\n\n${shareUrl}`
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`
      window.open(warpcastUrl, '_blank', 'width=550,height=600')
      return
    }

    setShareStatus(prev => ({
      ...prev,
      farcaster: { ...prev.farcaster, loading: true }
    }))

    const castText = `${shareText}\n\n${shareUrl}`
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`
    window.open(warpcastUrl, '_blank', 'width=550,height=600')
    
    const result = await trackShare('farcaster')
    
    // Don't mark as shared yet - only after verification
    setShareStatus(prev => ({
      ...prev,
      farcaster: { ...prev.farcaster, loading: false, shareId: result.shareId }
    }))

    // Show verification modal after a short delay (gives user time to post)
    if (result.success && result.shareId && user) {
      setTimeout(() => {
        setPendingVerification({ shareId: result.shareId!, platform: 'farcaster' })
        setShowVerification(true)
      }, 3000) // 3 second delay
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-xl border border-border w-full max-w-md shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-xl font-bold">Share & Earn</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <XIcon className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Share to earn +1000 points per platform
            </p>

            {checkingExistingShares ? (
              /* Loading state while checking existing shares */
              <div className="space-y-4">
                <div className="w-full flex items-center justify-center p-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Checking your shares...</p>
                  </div>
                </div>
              </div>
            ) : (
              /* Share buttons */
              <>
                {/* Twitter Share */}
                <button
              onClick={handleShareToTwitter}
              disabled={!isTwitterConfigured || shareStatus.twitter.loading}
              className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all ${
                !isTwitterConfigured
                  ? 'bg-muted/50 border-border cursor-not-allowed opacity-60'
                  : shareStatus.twitter.earned
                  ? 'bg-green-500/10 border-green-500/30 cursor-pointer hover:bg-green-500/20'
                  : shareStatus.twitter.loading
                  ? 'bg-card border-border cursor-wait'
                  : 'bg-card border-border hover:bg-muted cursor-pointer'
              }`}
            >
              <Twitter className={`w-6 h-6 ${
                !isTwitterConfigured 
                  ? 'text-muted-foreground' 
                  : shareStatus.twitter.earned 
                  ? 'text-blue-400' 
                  : 'text-muted-foreground'
              }`} />
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-semibold ${!isTwitterConfigured ? 'text-muted-foreground' : ''}`}>
                    Share to X
                  </h3>
                  {!isTwitterConfigured && (
                    <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {!isTwitterConfigured
                    ? 'Twitter integration coming soon'
                    : shareStatus.twitter.loading
                    ? 'Processing...'
                    : shareStatus.twitter.earned
                      ? 'Earned +1000 points - Share again!'
                      : 'Share your profile'}
                </p>
              </div>
              {!isTwitterConfigured ? (
                <Lock className="w-5 h-5 text-muted-foreground" />
              ) : shareStatus.twitter.earned ? (
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="text-xs font-semibold text-green-500">+1000</span>
                </div>
              ) : null}
            </button>

            {/* Farcaster Share */}
            <button
              onClick={handleShareToFarcaster}
              disabled={shareStatus.farcaster.loading}
              className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all ${
                shareStatus.farcaster.earned
                  ? 'bg-green-500/10 border-green-500/30 cursor-pointer hover:bg-green-500/20'
                  : shareStatus.farcaster.loading
                  ? 'bg-card border-border cursor-wait'
                  : 'bg-card border-border hover:bg-muted cursor-pointer'
              }`}
            >
              <FarcasterIcon className={`w-6 h-6 ${shareStatus.farcaster.earned ? 'text-purple-400' : 'text-muted-foreground'}`} />
              <div className="flex-1 text-left">
                <h3 className="text-sm font-semibold">Share to Farcaster</h3>
                <p className="text-xs text-muted-foreground">
                  {shareStatus.farcaster.loading
                    ? 'Processing...'
                    : shareStatus.farcaster.earned
                    ? 'Earned +1000 points - Share again!'
                    : 'Share your profile'}
                </p>
              </div>
              {shareStatus.farcaster.earned && (
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="text-xs font-semibold text-green-500">+1000</span>
                </div>
              )}
            </button>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Points are awarded once per platform after verification
            </p>
          </div>
        </div>
      </div>

      {/* Verification Modal */}
      {showVerification && pendingVerification && user && (
        <ShareVerificationModal
          isOpen={showVerification}
          onClose={() => {
            setShowVerification(false)
            setPendingVerification(null)
          }}
          shareId={pendingVerification.shareId}
          platform={pendingVerification.platform}
          userId={user.id}
          onSuccess={(_pointsAwarded) => {
            // Update the share status to show points were earned
            if (pendingVerification.platform === 'twitter') {
              setShareStatus(prev => ({
                ...prev,
                twitter: { ...prev.twitter, earned: true }
              }))
            } else if (pendingVerification.platform === 'farcaster') {
              setShareStatus(prev => ({
                ...prev,
                farcaster: { ...prev.farcaster, earned: true }
              }))
            }
          }}
        />
      )}
    </>
  )
}

