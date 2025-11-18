'use client'

import { Shield, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * On-chain badge component for displaying blockchain verification status.
 * 
 * Displays a badge indicating whether a user's identity is verified on-chain
 * via NFT registration. Shows different icons and tooltips for verified vs
 * unverified states. Includes hover tooltip with NFT token ID for verified users.
 * 
 * Features:
 * - Verified/unverified state display
 * - NFT token ID display in tooltip
 * - Size variants (sm, md, lg)
 * - Optional label text
 * - Hover tooltips
 * 
 * @param props - OnChainBadge component props
 * @returns On-chain badge element
 * 
 * @example
 * ```tsx
 * <OnChainBadge
 *   isRegistered={true}
 *   nftTokenId={123}
 *   size="md"
 *   showLabel={true}
 * />
 * ```
 */
interface OnChainBadgeProps {
  isRegistered: boolean
  nftTokenId?: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function OnChainBadge({ 
  isRegistered, 
  nftTokenId,
  size = 'md',
  showLabel = false,
  className 
}: OnChainBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  if (isRegistered && nftTokenId) {
    return (
      <div 
        className={cn("relative inline-flex items-center gap-1", className)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <ShieldCheck 
          className={cn(
            sizeClasses[size],
            "text-green-500 shrink-0"
          )}
          fill="currentColor"
        />
        {showLabel && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
            Verified On-Chain
          </span>
        )}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg z-50 whitespace-nowrap">
            <div className="text-xs space-y-1">
              <p className="font-semibold text-green-500">✓ Verified On-Chain</p>
              <p className="text-muted-foreground">NFT Token ID: #{nftTokenId}</p>
              <p className="text-muted-foreground">Blockchain identity verified</p>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px]">
              <div className="border-4 border-transparent border-t-border" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Not registered on-chain
  return (
    <div 
      className={cn("relative inline-flex items-center gap-1", className)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Shield 
        className={cn(
          sizeClasses[size],
          "text-muted-foreground/50 shrink-0"
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground font-medium">
          Not Verified
        </span>
      )}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg z-50 whitespace-nowrap">
          <div className="text-xs space-y-1">
            <p className="font-semibold text-muted-foreground">⚠ Not Verified On-Chain</p>
            <p className="text-muted-foreground/70">No blockchain identity</p>
            <p className="text-muted-foreground/70">Limited reputation features</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px]">
            <div className="border-4 border-transparent border-t-border" />
          </div>
        </div>
      )}
    </div>
  )
}

