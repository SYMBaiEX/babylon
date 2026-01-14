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
    <div className="fixed top-14 right-0 left-0 z-[60] flex items-center justify-between gap-4 border-[#0066FF]/30 border-b bg-[#0066FF]/90 px-4 py-2 backdrop-blur-sm md:top-0">
      <p className="min-w-0 text-sm text-white">
        <span className="font-semibold">ProtoMonkeys</span>
        <span className="hidden text-white/80 sm:inline">
          {' '}
          — Exclusive NFTs for top 100 players on leaderboard
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/nft"
          className="rounded-full bg-white px-4 py-1.5 font-medium text-[#0066FF] text-sm transition-all hover:bg-white/90"
        >
          View
        </Link>
        <button
          onClick={handleDismiss}
          className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
