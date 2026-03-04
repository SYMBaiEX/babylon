'use client';

import { ImageIcon, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { NftCollection } from '@/stores/onchainWalletStore';
import { WalletEmptyState } from './WalletEmptyState';

interface NftPortfolioProps {
  collections: NftCollection[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function NftPortfolio({
  collections,
  totalCount,
  loading,
  error,
  onRefresh,
}: NftPortfolioProps) {
  if (loading && collections.length === 0) {
    return <NftPortfolioSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
        <p className="mb-2 font-medium text-red-500 text-sm">
          Failed to load NFTs
        </p>
        <p className="mb-3 text-muted-foreground text-xs">{error}</p>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (totalCount === 0 && !loading) {
    return (
      <WalletEmptyState
        title="No NFTs found"
        description="You don't own any NFTs yet. NFTs you receive or mint will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          NFTs ({totalCount})
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          title="Refresh NFTs"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {collections.map((collection) => (
        <div key={collection.contractAddress}>
          <h4 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {collection.name}
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {collection.items.map((nft) => (
              <Link
                key={`${nft.contractAddress}-${nft.tokenId}`}
                href={`/nft/${nft.tokenId}`}
                className="group overflow-hidden rounded-lg border border-border transition-all hover:border-[#0066FF]/50 hover:shadow-sm"
              >
                <div className="relative aspect-square bg-muted">
                  {nft.thumbnailUrl || nft.imageUrl ? (
                    <img
                      src={nft.thumbnailUrl || nft.imageUrl || ''}
                      alt={nft.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate font-medium text-foreground text-xs">
                    {nft.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    #{nft.tokenId}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NftPortfolioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-20 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-border"
          >
            <div className="aspect-square animate-pulse bg-muted" />
            <div className="space-y-1.5 p-2">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-8 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
