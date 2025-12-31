'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import type { NftSummary } from '@/types/nft';

interface NftCardProps {
  nft: NftSummary;
  priority?: boolean;
}

export function NftCard({ nft, priority = false }: NftCardProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <Link
      href={`/nft/${nft.tokenId}`}
      className="group relative block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-[#0066FF]/50 hover:shadow-[#0066FF]/10 hover:shadow-lg"
    >
      {/* NFT Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {!imageError ? (
          <Image
            src={nft.thumbnailUrl || nft.imageUrl}
            alt={nft.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            priority={priority}
            onError={handleImageError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <span className="text-4xl">🖼️</span>
          </div>
        )}

        {/* Claimed Badge */}
        {nft.owner && (
          <div className="absolute top-2 right-2 rounded-full bg-green-500/90 px-2 py-1 font-medium text-white text-xs backdrop-blur-sm">
            Claimed
          </div>
        )}

        {/* Token ID Badge */}
        <div className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-1 font-medium text-white text-xs backdrop-blur-sm">
          #{nft.tokenId}
        </div>
      </div>

      {/* Card Content */}
      <div className="p-3">
        <h3 className="mb-1 truncate font-semibold text-foreground text-sm">
          {nft.name}
        </h3>

        {/* Owner Info */}
        {nft.owner ? (
          <div className="flex items-center gap-2">
            <Avatar
              id={nft.owner.user?.id ?? nft.owner.walletAddress}
              name={
                nft.owner.user?.displayName ??
                nft.owner.user?.username ??
                'Unknown'
              }
              src={nft.owner.user?.profileImageUrl ?? undefined}
              size="xs"
            />
            <span className="truncate text-muted-foreground text-xs">
              {nft.owner.user?.displayName ??
                nft.owner.user?.username ??
                `${nft.owner.walletAddress.slice(0, 6)}...${nft.owner.walletAddress.slice(-4)}`}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">Unclaimed</span>
        )}
      </div>
    </Link>
  );
}
