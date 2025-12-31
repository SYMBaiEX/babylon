'use client';

import type { NftSummary } from '@/types/nft';
import { NftCard } from './NftCard';

interface NftGridProps {
  nfts: NftSummary[];
  isLoading?: boolean;
}

export function NftGrid({ nfts, isLoading = false }: NftGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="p-3">
              <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="mb-4 text-6xl">🖼️</span>
        <h3 className="mb-2 font-semibold text-foreground text-lg">
          No NFTs Found
        </h3>
        <p className="text-muted-foreground text-sm">
          No NFTs match your current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {nfts.map((nft, index) => (
        <NftCard key={nft.tokenId} nft={nft} priority={index < 10} />
      ))}
    </div>
  );
}
