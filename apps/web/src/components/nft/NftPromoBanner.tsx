'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nft-banner-dismissed';

export function NftPromoBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setIsVisible(true);
  }, []);

  if (!isVisible) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  return (
    <div className="relative z-[60] flex items-center justify-between gap-4 border-[#0066FF]/30 border-b bg-[#0066FF]/10 px-4 py-2">
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
          className="rounded-full bg-[#0066FF] px-4 py-1.5 font-medium text-sm text-white transition-all hover:bg-[#2952d9]"
        >
          View
        </Link>
        <button
          onClick={handleDismiss}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
