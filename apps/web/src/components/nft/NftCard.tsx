'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { NftSummary } from '@/types/nft';

interface NftCardProps {
  nft: NftSummary;
  priority?: boolean;
}

export function NftCard({ nft, priority = false }: NftCardProps) {
  const [imageError, setImageError] = useState(false);

  const ownerName =
    nft.owner?.user?.displayName ??
    nft.owner?.user?.username ??
    (nft.owner
      ? `${nft.owner.walletAddress.slice(0, 6)}...${nft.owner.walletAddress.slice(-4)}`
      : null);

  return (
    <Link
      href={`/nft/${nft.tokenId}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-[#0066FF]/50"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {!imageError ? (
          <Image
            src={nft.thumbnailUrl || nft.imageUrl}
            alt={nft.name}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            priority={priority}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-4xl">
            🖼️
          </div>
        )}

        {/* Token ID badge */}
        <div className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-medium text-white text-xs">
          #{nft.tokenId}
        </div>

        {/* Claimed indicator */}
        {nft.owner && (
          <div className="absolute top-2 right-2 rounded bg-green-500 px-1.5 py-0.5 font-medium text-white text-xs">
            ✓
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <h3 className="truncate font-medium text-foreground text-sm">
          {nft.name}
        </h3>
        {ownerName ? (
          <p className="truncate text-muted-foreground text-xs">
            Owned by <span className="text-foreground">@{ownerName}</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">Available</p>
        )}
      </div>
    </Link>
  );
}
