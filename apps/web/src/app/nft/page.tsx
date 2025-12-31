'use client';

import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Grid3X3,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { MintBanner, NftGrid, RevealModal } from '@/components/nft';
import { PageContainer } from '@/components/shared/PageContainer';
import { Button } from '@/components/ui/button';
import { useNftMint } from '@/hooks/useNftMint';
import type { NftGalleryResponse, NftSummary } from '@/types/nft';

type ClaimedFilter = 'all' | 'claimed' | 'unclaimed';
type SortField = 'tokenId' | 'name';
type SortOrder = 'asc' | 'desc';

export default function NftGalleryPage() {
  const { flowState, mintedNft, startMint, resetFlow } = useNftMint();

  // Gallery state
  const [nfts, setNfts] = useState<NftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalNfts, setTotalNfts] = useState(0);
  const [claimedCount, setClaimedCount] = useState(0);

  // Filters
  const [claimedFilter, setClaimedFilter] = useState<ClaimedFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('tokenId');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const showRevealModal = flowState === 'revealing';

  const pageSize = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch NFTs
  const fetchNfts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      sort: sortField,
      order: sortOrder,
    });

    if (claimedFilter !== 'all') {
      params.set('claimed', claimedFilter === 'claimed' ? 'true' : 'false');
    }

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
    setTotalPages(data.data.pagination.totalPages);
    setTotalNfts(data.data.stats.totalNfts);
    setClaimedCount(data.data.stats.claimedCount);
    setLoading(false);
  }, [page, sortField, sortOrder, claimedFilter, debouncedSearch]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  // Handle mint using the hook
  const handleMint = async () => {
    await startMint();
    // Refresh NFT list after mint
    fetchNfts();
  };

  const handleCloseReveal = () => {
    resetFlow();
  };

  return (
    <PageContainer noPadding className="flex h-full flex-col">
      {/* Mint Banner */}
      <MintBanner onMintClick={handleMint} />

      {/* Header */}
      <div className="flex flex-col gap-4 border-border border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-[#0066FF]" />
            <h1 className="font-bold text-foreground text-xl">
              NFT Collection
            </h1>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span>{totalNfts} Total</span>
            <span>•</span>
            <span className="text-green-500">{claimedCount} Claimed</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pr-4 pl-10 text-foreground text-sm placeholder:text-muted-foreground focus:border-[#0066FF] focus:outline-none focus:ring-1 focus:ring-[#0066FF]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-4 border-border border-b bg-muted/30 px-4 py-3">
          {/* Claimed Filter */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Status:</span>
            <div className="flex rounded-lg border border-border bg-background p-1">
              {(['all', 'claimed', 'unclaimed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => {
                    setClaimedFilter(filter);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1 font-medium text-sm transition-colors ${
                    claimedFilter === filter
                      ? 'bg-[#0066FF] text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sort:</span>
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-') as [
                  SortField,
                  SortOrder,
                ];
                setSortField(field);
                setSortOrder(order);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-foreground text-sm focus:border-[#0066FF] focus:outline-none"
            >
              <option value="tokenId-asc">Token ID ↑</option>
              <option value="tokenId-desc">Token ID ↓</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="mb-2 font-semibold text-foreground text-lg">
              Failed to load collection
            </p>
            <p className="mb-4 text-muted-foreground text-sm">{error}</p>
            <Button variant="outline" onClick={fetchNfts}>
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* NFT Grid */}
      {!error && (
        <div className="flex-1 overflow-y-auto p-4">
          <NftGrid nfts={nfts} isLoading={loading} />

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Reveal Modal */}
      <RevealModal
        isOpen={showRevealModal}
        nft={mintedNft}
        onClose={handleCloseReveal}
      />
    </PageContainer>
  );
}
