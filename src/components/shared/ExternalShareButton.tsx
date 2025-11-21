/**
 * External share button component with tracking and points rewards.
 * 
 * Provides sharing functionality to Twitter/X, Farcaster, and copy link.
 * Tracks shares for authenticated users and awards points. Shows verification
 * modal after sharing to verify the share was posted.
 * 
 * @example
 * ```tsx
 * <ExternalShareButton
 *   contentType="post"
 *   contentId="123"
 *   text="Check out this post!"
 * />
 * ```
 */

import { useState, useEffect } from 'react'
import { Share2, Twitter, Link as LinkIcon, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ShareVerificationModal } from './ShareVerificationModal'
import { trackExternalShare } from '@/lib/share/trackExternalShare'

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

/**
 * Props for ExternalShareButton component.
 */
interface ExternalShareButtonProps {
  contentType: 'post' | 'profile' | 'market' | 'referral' | 'leaderboard'
  contentId?: string
  url?: string
  text?: string
  className?: string
}

/**
 * External share button component.
 * 
 * @param props - ExternalShareButton component props
 * @returns Share button element with dropdown menu
 */
export function ExternalShareButton({
  contentType,
  contentId,
  url,
  text,
  className = '',
}: ExternalShareButtonProps) {
  const { authenticated, user } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const [shared, setShared] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [pendingVerification, setPendingVerification] = useState<{
    shareId: string
    platform: 'twitter' | 'farcaster'
  } | null>(null)
  const [earnedPlatforms, setEarnedPlatforms] = useState<Set<string>>(new Set())

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
  const shareText = text || 'Check this out!'

  // Check for existing earned shares on mount
  useEffect(() => {
    const checkExistingShares = async () => {
      if (!authenticated || !user) return

      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!token) return

      try {
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
          
          // Track which platforms have already earned points
          const earned = new Set<string>()
          shares.forEach((share: { platform: string }) => {
            earned.add(share.platform)
          })
          setEarnedPlatforms(earned)
        }
      } catch (error) {
        console.error('Failed to check existing shares:', error)
      }
    }

    checkExistingShares()
  }, [authenticated, user, contentType])

  const handleShareToTwitter = async () => {
    // Check if shareText already contains the URL to avoid duplication
    const textContainsUrl = shareText.includes(shareUrl)
    const twitterUrl = textContainsUrl
      ? `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`
      : `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, '_blank', 'width=550,height=420')
    
    // If already earned, skip verification
    if (earnedPlatforms.has('twitter')) {
      setShared(true)
      setTimeout(() => setShared(false), 2000)
      setShowMenu(false)
      return
    }
    
    const result = authenticated && user
      ? await trackExternalShare({
          platform: 'twitter',
          contentType,
          contentId,
          url: shareUrl,
          userId: user.id,
        })
      : { shareActionId: null, pointsAwarded: 0, alreadyAwarded: false }
    if (result.pointsAwarded > 0) {
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
    const shareId = result.shareActionId
    setShowMenu(false)
    
    // Show verification modal after a short delay (gives user time to post)
    if (shareId && user) {
      setTimeout(() => {
        setPendingVerification({ shareId, platform: 'twitter' })
        setShowVerification(true)
      }, 3000) // 3 second delay
    }
  }

  const handleShareToFarcaster = async () => {
    // Warpcast compose URL format - use shareText which now includes the link
    const castText = shareText.includes('http') 
      ? shareText  // Already has link in text
      : `${shareText}\n\n${shareUrl}`  // Add link if not present
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(shareUrl)}`
    window.open(warpcastUrl, '_blank', 'width=550,height=600')
    
    // If already earned, skip verification
    if (earnedPlatforms.has('farcaster')) {
      setShared(true)
      setTimeout(() => setShared(false), 2000)
      setShowMenu(false)
      return
    }
    
    const result = authenticated && user
      ? await trackExternalShare({
          platform: 'farcaster',
          contentType,
          contentId,
          url: shareUrl,
          userId: user.id,
        })
      : { shareActionId: null, pointsAwarded: 0, alreadyAwarded: false }
    if (result.pointsAwarded > 0) {
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
    const shareId = result.shareActionId
    setShowMenu(false)
    
    // Show verification modal after a short delay (gives user time to post)
    if (shareId && user) {
      setTimeout(() => {
        setPendingVerification({ shareId, platform: 'farcaster' })
        setShowVerification(true)
      }, 3000) // 3 second delay
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    if (authenticated && user) {
      void trackExternalShare({
        platform: 'link',
        contentType,
        contentId,
        url: shareUrl,
        userId: user.id,
      })
    }
    setShared(true)
    setTimeout(() => setShared(false), 2000)
    setShowMenu(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 text-foreground transition-colors ${className}`}
        aria-label="Share"
      >
        {shared ? (
          <>
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-green-500">Shared!</span>
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            <span className="text-sm font-medium">Share</span>
          </>
        )}
      </button>

      {/* Share Menu */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-48 bg-sidebar rounded-lg shadow-lg border border-border overflow-hidden z-50">
            <button
              onClick={handleShareToTwitter}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sidebar-accent text-left transition-colors"
            >
              <Twitter className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-foreground">Share to X</span>
            </button>

            <button
              onClick={handleShareToFarcaster}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sidebar-accent text-left transition-colors"
            >
              <FarcasterIcon className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-foreground">Share to Farcaster</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sidebar-accent text-left transition-colors"
            >
              <LinkIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Copy Link</span>
            </button>
          </div>
        </>
      )}

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
        />
      )}
    </div>
  )
}

