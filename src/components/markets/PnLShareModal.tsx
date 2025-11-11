'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { Twitter } from 'lucide-react'
import { Download, X } from 'lucide-react'
import { PortfolioPnLShareCard } from '@/components/markets/PortfolioPnLShareCard'
import { CategoryPnLShareCard } from '@/components/markets/CategoryPnLShareCard'
import type { PortfolioPnLSnapshot } from '@/hooks/usePortfolioPnL'
import type { User } from '@/stores/authStore'
import { trackExternalShare } from '@/lib/share/trackExternalShare'

type MarketCategory = 'perps' | 'predictions' | 'pools'

interface CategoryPnLData {
  unrealizedPnL: number
  positionCount: number
  totalValue?: number
  categorySpecific?: {
    openInterest?: number
    totalShares?: number
    totalInvested?: number
  }
}

interface PnLShareModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'portfolio' | 'category'
  portfolioData?: PortfolioPnLSnapshot | null
  categoryData?: CategoryPnLData | null
  category?: MarketCategory
  user: User | null
}

function FarcasterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1000 1000" fill="currentColor" aria-hidden="true">
      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
      <path d="M128.889 253.333L157.778 351.111H182.222V844.444H128.889V253.333Z" />
      <path d="M871.111 253.333L842.222 351.111H817.778V844.444H871.111V253.333Z" />
    </svg>
  )
}

const categoryLabels: Record<MarketCategory, string> = {
  perps: 'Perpetual Futures',
  predictions: 'Prediction Markets',
  pools: 'Trading Pools',
}

export function PnLShareModal({
  isOpen,
  onClose,
  type,
  portfolioData,
  categoryData,
  category = 'perps',
  user,
}: PnLShareModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [sharing, setSharing] = useState<'twitter' | 'farcaster' | null>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const offscreenCardRef = useRef<HTMLDivElement>(null)

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/markets` : 'https://babylon.game'

  const canShare = Boolean(
    user && (type === 'portfolio' ? portfolioData : categoryData)
  )

  const data = type === 'portfolio' ? portfolioData : categoryData
  const categoryLabel = type === 'category' && category ? categoryLabels[category] : ''
  const contentId = type === 'portfolio' ? 'portfolio-pnl' : `${category}-pnl`

  const shareText = useMemo(() => {
    if (type === 'portfolio' && portfolioData) {
      return `My Babylon P&L is ${portfolioData.totalPnL >= 0 ? '+' : ''}$${Math.abs(portfolioData.totalPnL).toFixed(2)}. Trading narratives, sharing the upside.`
    }
    if (type === 'category' && categoryData) {
      return `My ${categoryLabel} P&L on Babylon is ${categoryData.unrealizedPnL >= 0 ? '+' : ''}$${Math.abs(categoryData.unrealizedPnL).toFixed(2)}. Trading narratives, sharing the upside.`
    }
    return type === 'portfolio' 
      ? 'Check out the markets on Babylon.'
      : `Check out ${categoryLabel} on Babylon.`
  }, [type, portfolioData, categoryData, categoryLabel])

  // Generate preview image when modal opens or data changes
  useEffect(() => {
    if (!isOpen || !canShare || !offscreenCardRef.current) {
      setPreviewImageUrl(null)
      return
    }

    const generatePreview = async () => {
      setIsGeneratingImage(true)
      try {
        const htmlToImage = await import('html-to-image')
        const dataUrl = await htmlToImage.toPng(offscreenCardRef.current!, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: '#050816',
        })
        setPreviewImageUrl(dataUrl)
      } catch (error) {
        console.error('Failed to generate preview:', error)
        toast.error('Failed to generate preview')
      } finally {
        setIsGeneratingImage(false)
      }
    }

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(generatePreview, 100)
    return () => clearTimeout(timeoutId)
  }, [isOpen, canShare, type, portfolioData, categoryData, category, user])

  if (!isOpen) return null

  const handleDownload = async () => {
    if (!previewImageUrl) {
      toast.error('Preview image not ready')
      return
    }
    setIsDownloading(true)
    try {
      const link = document.createElement('a')
      link.href = previewImageUrl
      link.download = `babylon-${type === 'portfolio' ? 'pnl' : `${category}-pnl`}-${Date.now()}.png`
      link.click()
      void trackExternalShare({
        platform: 'download',
        contentType: 'market',
        contentId,
        url: shareUrl,
        userId: user?.id,
      })
      toast.success('P&L card downloaded')
    } catch {
      toast.error('Failed to download card')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleShare = async (platform: 'twitter' | 'farcaster') => {
    if (!canShare || !user || !data) return

    setSharing(platform)
    const message =
      platform === 'twitter'
        ? `${shareText} ${shareUrl}`
        : `${shareText}\n\n${shareUrl} #BabylonMarkets`

    try {
      if (platform === 'twitter') {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`
        window.open(twitterUrl, '_blank', 'width=550,height=420')
      } else {
        const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(message)}`
        window.open(warpcastUrl, '_blank', 'width=550,height=600')
      }

      await trackExternalShare({
        platform,
        contentType: 'market',
        contentId,
        url: shareUrl,
        userId: user?.id,
      })
    } catch {
      toast.error('Failed to initiate share')
    } finally {
      setSharing(null)
    }
  }

  const modalTitle = type === 'portfolio' 
    ? 'Share Your P&L' 
    : `Share Your ${categoryLabel} P&L`
  
  const modalSubtitle = type === 'portfolio'
    ? 'Show off your Babylon performance card'
    : `Show off your Babylon ${category} performance`

  return (
    <>
      {/* Off-screen card for rendering to image */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={offscreenCardRef}>
          {canShare && type === 'portfolio' && portfolioData && (
            <PortfolioPnLShareCard 
              data={portfolioData} 
              user={user!} 
            />
          )}
          {canShare && type === 'category' && categoryData && (
            <CategoryPnLShareCard 
              category={category}
              data={categoryData} 
              user={user!} 
            />
          )}
        </div>
      </div>

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#050816] shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold text-white">{modalTitle}</h2>
              <p className="text-xs text-white/60">{modalSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Close share modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-4 px-6 py-6">
            {/* Preview Section */}
            <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
              {canShare ? (
                isGeneratingImage ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      <p className="text-sm text-white/60">Generating preview...</p>
                    </div>
                  </div>
                ) : previewImageUrl ? (
                  <img 
                    src={previewImageUrl} 
                    alt="P&L Card Preview" 
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/60">
                    Preparing preview...
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/70">
                  Sign in to generate your personalized P&amp;L card.
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!canShare || isDownloading || !previewImageUrl}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#050816] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </button>

              <button
                type="button"
                onClick={() => handleShare('twitter')}
                disabled={!canShare || sharing === 'twitter'}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Twitter className="h-4 w-4 text-sky-400" />
                <span className="hidden sm:inline">Share to X</span>
              </button>

              <button
                type="button"
                onClick={() => handleShare('farcaster')}
                disabled={!canShare || sharing === 'farcaster'}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FarcasterIcon className="h-4 w-4 text-purple-400" />
                <span className="hidden sm:inline">Share to Farcaster</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

