'use client';

import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface NftPromoBannerProps {
  variant?: 'full' | 'compact';
  showClose?: boolean;
}

export function NftPromoBanner({
  variant = 'compact',
  showClose = true,
}: NftPromoBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  if (variant === 'full') {
    return (
      <div className="relative overflow-hidden border-[#0066FF]/30 border-b bg-gradient-to-r from-[#0066FF]/10 via-purple-500/10 to-[#0066FF]/10">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 10px, currentColor 10px, currentColor 11px)',
            }}
          />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="hidden rounded-full bg-[#0066FF]/20 p-3 sm:block">
              <Sparkles className="h-8 w-8 text-[#0066FF]" />
            </div>
            <div>
              <h3 className="mb-1 flex items-center justify-center gap-2 font-bold text-foreground text-lg sm:justify-start">
                <Sparkles className="h-5 w-5 text-[#0066FF] sm:hidden" />
                Top 100 NFT Collection
              </h3>
              <p className="text-muted-foreground text-sm">
                Exclusive NFTs for our top 100 leaderboard players. Explore the
                collection!
              </p>
            </div>
          </div>

          <Link
            href="/nft"
            className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#0066FF] to-purple-500 px-6 py-3 font-semibold text-white transition-all hover:from-[#0055DD] hover:to-purple-600 hover:shadow-[#0066FF]/20 hover:shadow-lg"
          >
            <Sparkles className="h-4 w-4" />
            View Collection
          </Link>
        </div>

        {showClose && (
          <button
            onClick={() => setIsVisible(false)}
            className="absolute top-2 right-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // Compact variant
  return (
    <div className="relative flex items-center justify-between gap-4 border-[#0066FF]/30 border-b bg-gradient-to-r from-[#0066FF]/5 to-purple-500/5 px-4 py-2">
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 shrink-0 text-[#0066FF]" />
        <p className="text-foreground text-sm">
          <span className="font-semibold">Top 100 NFT Collection</span>
          <span className="hidden text-muted-foreground sm:inline">
            {' '}
            — Exclusive NFTs for top leaderboard players
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/nft"
          className="shrink-0 rounded-md bg-[#0066FF] px-3 py-1.5 font-medium text-sm text-white transition-colors hover:bg-[#0055DD]"
        >
          View
        </Link>
        {showClose && (
          <button
            onClick={() => setIsVisible(false)}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
