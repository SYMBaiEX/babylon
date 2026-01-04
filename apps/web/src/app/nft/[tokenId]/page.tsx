'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/Avatar';
import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';
import { Button } from '@/components/ui/button';
import type { NftDetail, NftDetailResponse } from '@/types/nft';

export default function NftDetailPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;

  const [nft, setNft] = useState<NftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const fetchNft = useCallback(async () => {
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/nft/${tokenId}`);

    if (!response.ok) {
      if (response.status === 404) {
        setError('NFT not found');
      } else {
        setError('Failed to load NFT details');
      }
      setLoading(false);
      return;
    }

    const data: NftDetailResponse = await response.json();
    setNft(data.data);
    setLoading(false);
  }, [tokenId]);

  useEffect(() => {
    fetchNft();
  }, [fetchNft]);

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const handleShare = async () => {
    if (!nft) return;

    const url = `${window.location.origin}/nft/${nft.tokenId}`;

    if (navigator.share) {
      await navigator.share({ title: nft.name, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    }
  };

  if (loading) {
    return (
      <PageContainer className="pb-8">
        <div className="mb-6">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !nft) {
    return (
      <PageContainer className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="mb-2 font-medium text-foreground text-xl">
            {error ?? 'NFT not found'}
          </p>
          <p className="mb-6 text-muted-foreground">
            The NFT you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href="/nft">
            <Button>← Back to Gallery</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const ownerName =
    nft.currentOwner?.user?.displayName ??
    nft.currentOwner?.user?.username ??
    (nft.currentOwner
      ? `${nft.currentOwner.walletAddress.slice(0, 6)}...${nft.currentOwner.walletAddress.slice(-4)}`
      : null);

  return (
    <PageContainer className="pb-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/nft"
          className="text-muted-foreground text-sm hover:text-foreground"
        >
          ← Back to Gallery
        </Link>
        <button
          onClick={handleShare}
          className="text-muted-foreground text-sm hover:text-foreground"
        >
          Share
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
          {!imageError ? (
            <Image
              src={nft.imageUrl}
              alt={nft.name}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl">
              🖼️
            </div>
          )}

          <div className="absolute top-3 left-3 rounded bg-black/70 px-2 py-1 font-medium text-sm text-white">
            #{nft.tokenId}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-5">
          {/* Title & Description */}
          <div>
            <h1 className="mb-2 font-bold text-2xl text-foreground">
              {nft.name}
            </h1>
            {nft.description && (
              <p className="text-muted-foreground">{nft.description}</p>
            )}
          </div>

          {/* Owner */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-muted-foreground text-xs uppercase">
              Owner
            </p>
            {nft.currentOwner ? (
              <div className="flex items-center gap-3">
                <Avatar
                  id={nft.currentOwner.user?.id ?? nft.currentOwner.walletAddress}
                  name={ownerName ?? 'Unknown'}
                  src={nft.currentOwner.user?.profileImageUrl ?? undefined}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  {nft.currentOwner.user ? (
                    <Link
                      href={`/profile/${nft.currentOwner.user.username ?? nft.currentOwner.user.id}`}
                      className="font-medium text-foreground hover:text-[#0066FF]"
                    >
                      @{nft.currentOwner.user.username ?? nft.currentOwner.user.displayName}
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleCopy(nft.currentOwner!.walletAddress, 'Address')}
                      className="font-mono text-foreground text-sm hover:text-[#0066FF]"
                    >
                      {ownerName}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Not yet claimed</p>
            )}
          </div>

          {/* Story */}
          {nft.story.content && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 font-medium text-foreground">
                {nft.story.title ?? 'Story'}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                {nft.story.content}
              </p>
            </div>
          )}

          {/* Attributes */}
          {nft.attributes.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-3 text-muted-foreground text-xs uppercase">
                Attributes
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {nft.attributes.map((attr, i) => (
                  <div key={i} className="rounded bg-muted/50 p-2 text-center">
                    <p className="text-muted-foreground text-xs">
                      {attr.trait_type}
                    </p>
                    <p className="truncate font-medium text-foreground text-sm">
                      {String(attr.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Original Claim */}
          {nft.originalClaim && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-3 text-muted-foreground text-xs uppercase">
                Original Claim
              </p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-bold text-[#0066FF] text-lg">
                    #{nft.originalClaim.snapshotRank}
                  </p>
                  <p className="text-muted-foreground text-xs">Rank</p>
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg">
                    {nft.originalClaim.snapshotPoints?.toLocaleString() ?? '-'}
                  </p>
                  <p className="text-muted-foreground text-xs">Points</p>
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg">
                    {new Date(nft.originalClaim.claimedAt).toLocaleDateString(
                      'en-US',
                      { month: 'short', day: 'numeric' }
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">Date</p>
                </div>
              </div>
            </div>
          )}

          {/* Contract Info */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-muted-foreground text-xs uppercase">
              Contract
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Address</span>
                <button
                  onClick={() => handleCopy(nft.contractAddress, 'Contract address')}
                  className="font-mono text-foreground hover:text-[#0066FF]"
                >
                  {nft.contractAddress.slice(0, 6)}...{nft.contractAddress.slice(-4)}
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token ID</span>
                <span className="font-mono text-foreground">{nft.tokenId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chain</span>
                <span className="text-foreground">
                  {nft.chainId === 1 ? 'Ethereum' : `Chain ${nft.chainId}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
