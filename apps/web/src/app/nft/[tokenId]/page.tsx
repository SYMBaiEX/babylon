'use client';

import { ArrowLeft, Copy, ExternalLink, Share2, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';
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

  const handleCopyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  const handleShare = async () => {
    if (!nft) return;

    const url = `${window.location.origin}/nft/${nft.tokenId}`;
    const text = `Check out ${nft.name} from the Babylon Top 100 NFT Collection!`;

    if (navigator.share) {
      await navigator.share({ title: nft.name, text, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  // Loading State
  if (loading) {
    return (
      <PageContainer className="pb-8">
        <div className="mb-6 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  // Error State
  if (error || !nft) {
    return (
      <PageContainer className="flex items-center justify-center py-16">
        <div className="text-center">
          <span className="mb-4 block text-6xl">🖼️</span>
          <h2 className="mb-2 font-bold text-foreground text-xl">
            {error ?? 'NFT not found'}
          </h2>
          <p className="mb-6 text-muted-foreground">
            The NFT you&apos;re looking for doesn&apos;t exist or has been
            removed.
          </p>
          <Link href="/nft">
            <Button variant="primary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Gallery
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pb-8">
      {/* Back Button */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/nft"
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Gallery</span>
        </Link>
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted shadow-xl">
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
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-8xl">🖼️</span>
            </div>
          )}

          {/* Token ID Badge */}
          <div className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1.5 font-medium text-sm text-white backdrop-blur-sm">
            #{nft.tokenId}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-6">
          {/* Title */}
          <div>
            <h1 className="mb-2 font-bold text-3xl text-foreground">
              {nft.name}
            </h1>
            {nft.description && (
              <p className="text-muted-foreground">{nft.description}</p>
            )}
          </div>

          {/* Owner */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground text-sm">
              <User className="h-4 w-4" />
              Current Owner
            </h3>
            {nft.currentOwner ? (
              <div className="flex items-center gap-3">
                <Avatar
                  id={
                    nft.currentOwner.user?.id ?? nft.currentOwner.walletAddress
                  }
                  name={
                    nft.currentOwner.user?.displayName ??
                    nft.currentOwner.user?.username ??
                    'Unknown'
                  }
                  src={nft.currentOwner.user?.profileImageUrl ?? undefined}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  {nft.currentOwner.user ? (
                    <>
                      <Link
                        href={`/profile/${nft.currentOwner.user.username ?? nft.currentOwner.user.id}`}
                        className="block truncate font-semibold text-foreground hover:text-[#0066FF]"
                      >
                        {nft.currentOwner.user.displayName ??
                          nft.currentOwner.user.username}
                      </Link>
                      {nft.currentOwner.user.username && (
                        <p className="truncate text-muted-foreground text-sm">
                          @{nft.currentOwner.user.username}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-foreground text-sm">
                        {nft.currentOwner.walletAddress.slice(0, 8)}...
                        {nft.currentOwner.walletAddress.slice(-6)}
                      </span>
                      <button
                        onClick={() =>
                          handleCopyAddress(nft.currentOwner!.walletAddress)
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                This NFT has not been claimed yet
              </p>
            )}
          </div>

          {/* Story */}
          {nft.story.content && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-semibold text-foreground">
                {nft.story.title ?? 'The Story'}
              </h3>
              <div className="prose prose-sm prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {nft.story.content}
                </p>
              </div>
            </div>
          )}

          {/* Attributes */}
          {nft.attributes.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-semibold text-foreground">Attributes</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {nft.attributes.map((attr, index) => (
                  <div
                    key={index}
                    className="rounded-lg bg-muted/50 p-3 text-center"
                  >
                    <p className="mb-1 text-muted-foreground text-xs uppercase">
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
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-semibold text-foreground">
                Original Claim
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Leaderboard Rank
                  </span>
                  <span className="font-semibold text-[#0066FF]">
                    #{nft.originalClaim.snapshotRank}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Snapshot Points</span>
                  <span className="font-semibold text-foreground">
                    {nft.originalClaim.snapshotPoints?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Claimed</span>
                  <span className="text-foreground">
                    {new Date(nft.originalClaim.claimedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Contract Info */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 font-semibold text-foreground">
              Contract Details
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Contract</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground">
                    {nft.contractAddress.slice(0, 6)}...
                    {nft.contractAddress.slice(-4)}
                  </span>
                  <button
                    onClick={() => handleCopyAddress(nft.contractAddress)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <a
                    href={`https://etherscan.io/address/${nft.contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token ID</span>
                <span className="font-mono text-foreground">{nft.tokenId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chain</span>
                <span className="text-foreground">
                  {nft.chainId === 1
                    ? 'Ethereum Mainnet'
                    : `Chain ${nft.chainId}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolution</span>
                <span className="text-foreground">{nft.imageResolution}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
