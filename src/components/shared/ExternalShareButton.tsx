/**
 * ShareButton Component
 * 
 * Button to share content with tracking and points rewards
 */

import { useState } from 'react'
import { Share2, Twitter, Link as LinkIcon, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

interface ExternalShareButtonProps {
  contentType: 'post' | 'profile' | 'market' | 'referral' | 'leaderboard'
  contentId?: string
  url?: string
  text?: string
  className?: string
}

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

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
  const shareText = text || 'Check this out!'

  const trackShare = async (platform: string) => {
    if (!authenticated || !user) {
      logger.warn('User not authenticated, cannot track share', undefined, 'ExternalShareButton')
      return
    }

    const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
    if (!token) {
      logger.warn('No access token available', undefined, 'ExternalShareButton')
      return
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
      if (data.points?.awarded > 0) {
        logger.info(
          `Earned ${data.points.awarded} points for sharing to ${platform}`,
          { platform, points: data.points.awarded },
          'ExternalShareButton'
        )
        
        // Show success feedback
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    }
  }

  const handleShareToTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, '_blank', 'width=550,height=420')
    trackShare('twitter')
    setShowMenu(false)
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    trackShare('link')
    setShared(true)
    setTimeout(() => setShared(false), 2000)
    setShowMenu(false)
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: shareText,
        url: shareUrl,
      })
      trackShare('native')
      setShowMenu(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors ${className}`}
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
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden z-50">
            <button
              onClick={handleShareToTwitter}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-left transition-colors"
            >
              <Twitter className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-gray-200">Share to X</span>
              <span className="ml-auto text-xs text-yellow-500">+1000</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-left transition-colors"
            >
              <LinkIcon className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-200">Copy Link</span>
              <span className="ml-auto text-xs text-yellow-500">+1000</span>
            </button>

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-left transition-colors"
              >
                <Share2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-200">Share...</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

