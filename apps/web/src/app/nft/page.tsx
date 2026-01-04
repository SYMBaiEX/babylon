'use client';

import { useCallback, useEffect, useState } from 'react';
import { NftGrid, RevealModal } from '@/components/nft';
import { PageContainer } from '@/components/shared/PageContainer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useNftMint } from '@/hooks/useNftMint';
import type { NftGalleryResponse, NftSummary } from '@/types/nft';

type ViewTab = 'all' | 'mine';

export default function NftGalleryPage() {
  const { authenticated, user } = useAuth();
  const {
    eligibility,
    isCheckingEligibility,
    flowState,
    mintedNft,
    isMinting,
    startMint,
    resetFlow,
    checkEligibility,
  } = useNftMint();

  // Gallery state
  const [nfts, setNfts] = useState<NftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs & filters
  const [viewTab, setViewTab] = useState<ViewTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Stats
  const [totalNfts, setTotalNfts] = useState(0);
  const [claimedCount, setClaimedCount] = useState(0);

  // Modals
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const showRevealModal = flowState === 'revealing';

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch all NFTs (no pagination - show all 100)
  const fetchNfts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      limit: '100',
      sort: 'tokenId',
      order: 'asc',
    });

    if (debouncedSearch.trim()) {
      params.set('search', debouncedSearch.trim());
    }

    const response = await fetch(`/api/nft/collection?${params.toString()}`);

    if (!response.ok) {
      setError('Failed to load NFT collection');
      setLoading(false);
      return;
    }

    const data: NftGalleryResponse = await response.json();

    setNfts(data.data.nfts);
    setTotalNfts(data.data.stats.totalNfts);
    setClaimedCount(data.data.stats.claimedCount);
    setLoading(false);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  // Filter NFTs based on tab
  const displayedNfts =
    viewTab === 'mine' && user
      ? nfts.filter((nft) => nft.owner?.user?.id === user.id)
      : nfts;

  const myNftCount = user
    ? nfts.filter((nft) => nft.owner?.user?.id === user.id).length
    : 0;

  // Handle claim button click
  const handleClaimClick = async () => {
    if (!authenticated) return;
    await checkEligibility();
    setShowEligibilityModal(true);
  };

  // Handle mint from eligibility modal
  const handleMintFromModal = async () => {
    setShowEligibilityModal(false);
    await startMint();
    fetchNfts();
  };

  return (
    <PageContainer noPadding className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border border-b bg-card px-4 py-5">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="mb-1 font-bold text-foreground text-xl">
                Babylon Top 100
              </h1>
              <p className="text-muted-foreground text-sm">
                Exclusive NFTs for top leaderboard players
              </p>
            </div>

            {authenticated && !eligibility?.hasMinted && (
              <Button
                onClick={handleClaimClick}
                disabled={isMinting || isCheckingEligibility}
                className="bg-[#0066FF] hover:bg-[#0055DD]"
              >
                {isCheckingEligibility ? 'Checking...' : 'Claim My NFT'}
              </Button>
            )}

            {eligibility?.hasMinted && eligibility.mintedNft && (
              <a
                href={`/nft/${eligibility.mintedNft.tokenId}`}
                className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-green-600 text-sm transition-colors hover:bg-green-500/20"
              >
                View My NFT →
              </a>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{totalNfts}</span>{' '}
              Total
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-green-600">{claimedCount}</span>{' '}
              Claimed
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {totalNfts - claimedCount}
              </span>{' '}
              Available
            </span>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="border-border border-b px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setViewTab('all')}
              className={`rounded-md px-4 py-2 font-medium text-sm transition-colors ${
                viewTab === 'all'
                  ? 'bg-[#0066FF] text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              All NFTs
            </button>
            {authenticated && (
              <button
                onClick={() => setViewTab('mine')}
                className={`rounded-md px-4 py-2 font-medium text-sm transition-colors ${
                  viewTab === 'mine'
                    ? 'bg-[#0066FF] text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                My NFT{myNftCount > 0 && ` (${myNftCount})`}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search by name or #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:border-[#0066FF] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="mb-2 font-medium text-foreground">
              Failed to load collection
            </p>
            <p className="mb-4 text-muted-foreground text-sm">{error}</p>
            <Button variant="outline" onClick={fetchNfts}>
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* NFT Grid - Scrollable */}
      {!error && (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-5xl">
            <NftGrid nfts={displayedNfts} isLoading={loading} />
          </div>
        </div>
      )}

      {/* Eligibility Modal */}
      {showEligibilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            {isCheckingEligibility ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#0066FF] border-t-transparent" />
                <p className="text-muted-foreground">
                  Checking your eligibility...
                </p>
              </div>
            ) : eligibility?.eligible && !eligibility.hasMinted ? (
              <div className="text-center">
                <div className="mb-4 text-5xl">🎉</div>
                <h3 className="mb-2 font-bold text-foreground text-xl">
                  You&apos;re Eligible!
                </h3>
                <p className="mb-2 text-muted-foreground">
                  You ranked{' '}
                  <span className="font-bold text-[#0066FF]">
                    #{eligibility.snapshotRank}
                  </span>{' '}
                  on the leaderboard
                </p>
                <p className="mb-6 text-muted-foreground text-sm">
                  Claim your exclusive NFT from the Babylon Top 100 collection
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowEligibilityModal(false)}
                    className="flex-1"
                  >
                    Maybe Later
                  </Button>
                  <Button
                    onClick={handleMintFromModal}
                    disabled={isMinting}
                    className="flex-1 bg-[#0066FF] hover:bg-[#0055DD]"
                  >
                    {isMinting ? 'Claiming...' : 'Claim My NFT'}
                  </Button>
                </div>
              </div>
            ) : eligibility?.hasMinted ? (
              <div className="text-center">
                <div className="mb-4 text-5xl">✅</div>
                <h3 className="mb-2 font-bold text-foreground text-xl">
                  Already Claimed
                </h3>
                <p className="mb-6 text-muted-foreground">
                  You&apos;ve already claimed your NFT!
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowEligibilityModal(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  {eligibility.mintedNft && (
                    <a
                      href={`/nft/${eligibility.mintedNft.tokenId}`}
                      className="flex-1"
                    >
                      <Button className="w-full bg-[#0066FF] hover:bg-[#0055DD]">
                        View My NFT
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-4 text-5xl">😔</div>
                <h3 className="mb-2 font-bold text-foreground text-xl">
                  Not Eligible
                </h3>
                <p className="mb-6 text-muted-foreground">
                  Only the top 100 leaderboard players can claim an NFT. Keep
                  trading to climb the ranks!
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowEligibilityModal(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  <a href="/leaderboard" className="flex-1">
                    <Button className="w-full">View Leaderboard</Button>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reveal Modal */}
      <RevealModal
        isOpen={showRevealModal}
        nft={mintedNft}
        onClose={resetFlow}
      />
    </PageContainer>
  );
}
