'use client';

import { X } from 'lucide-react';
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
      <div className="relative border-[#0066FF]/20 border-b bg-gradient-to-r from-[#0066FF]/5 to-purple-500/5">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm">
              <span className="font-semibold">Top 100 NFT Collection</span>
              <span className="text-muted-foreground">
                {' '}
                — Exclusive NFTs for our top leaderboard players. Explore the
                collection!
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/nft"
              className="rounded-md bg-gradient-to-r from-[#0066FF] to-purple-500 px-4 py-1.5 font-medium text-sm text-white transition-all hover:from-[#0055DD] hover:to-purple-600"
            >
              View Collection
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
      </div>
    );
  }

  // Compact variant
  return (
    <div className="relative flex items-center justify-between gap-4 border-[#0066FF]/20 border-b bg-gradient-to-r from-[#0066FF]/5 to-purple-500/5 px-4 py-2">
      <p className="min-w-0 text-foreground text-sm">
        <span className="font-semibold">Top 100 NFT Collection</span>
        <span className="hidden text-muted-foreground sm:inline">
          {' '}
          — Exclusive NFTs for top leaderboard players
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/nft"
          className="rounded-md bg-[#0066FF] px-3 py-1.5 font-medium text-sm text-white transition-colors hover:bg-[#0055DD]"
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
