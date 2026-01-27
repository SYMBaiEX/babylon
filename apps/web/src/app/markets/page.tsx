'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { MarketsToggle } from '@/components/shared/MarketsToggle';
import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton, WidgetPanelSkeleton } from '@/components/shared/Skeleton';
import type { MarketTab, PerpMarket, PredictionMarket } from '@/types/markets';
import {
  DashboardTabContent,
  LoginPrompt,
  MarketsSearchInput,
  PerpsTabContent,
  PredictionsTabContent,
} from './_components';
import { useMarketsPageData } from './_hooks';

// Lazy load modals - not needed for initial render
const CategoryPnLShareModal = dynamic(
  () =>
    import('@/components/markets/CategoryPnLShareModal').then((m) => ({
      default: m.CategoryPnLShareModal,
    })),
  { ssr: false }
);

const PortfolioPnLShareModal = dynamic(
  () =>
    import('@/components/markets/PortfolioPnLShareModal').then((m) => ({
      default: m.PortfolioPnLShareModal,
    })),
  { ssr: false }
);

const BuyPointsModal = dynamic(
  () =>
    import('@/components/points/BuyPointsModal').then((m) => ({
      default: m.BuyPointsModal,
    })),
  { ssr: false }
);

const PerpsTradingTerminal = dynamic(
  () =>
    import('./_components/perps-terminal/PerpsTradingTerminal').then((m) => ({
      default: m.PerpsTradingTerminal,
    })),
  { ssr: false }
);

/**
 * Valid tab values from URL params.
 */
const VALID_TABS: MarketTab[] = ['dashboard', 'perps', 'predictions'];

/**
 * Parse tab from URL search params.
 */
function parseTabFromParams(params: URLSearchParams): MarketTab {
  const tab = params.get('tab') ?? params.get('tabs');
  if (tab && VALID_TABS.includes(tab as MarketTab)) {
    return tab as MarketTab;
  }
  return 'dashboard';
}

/**
 * Markets page component.
 *
 * Main dashboard for trading perpetual futures and prediction markets.
 * Supports three views: Dashboard (overview), Perps (perpetual markets),
 * and Predictions (prediction markets).
 *
 * Features:
 * - Real-time market data via SSE
 * - User positions management
 * - Portfolio P&L tracking
 * - Search and filtering
 * - Responsive layout (desktop sidebar, mobile full-width)
 * - URL-based tab navigation (?tab=perps, ?tab=predictions)
 */
export default function MarketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Initialize tab from URL params for deep linking support
  const [activeTab, setActiveTab] = useState<MarketTab>(() =>
    parseTabFromParams(searchParams)
  );
  const [showBuyPointsModal, setShowBuyPointsModal] = useState(false);
  const [showPnLShareModal, setShowPnLShareModal] = useState(false);
  const [showCategoryPnLShareModal, setShowCategoryPnLShareModal] = useState<
    'perps' | 'predictions' | null
  >(null);

  // Ref guard to prevent Stripe redirect effect from firing multiple times
  const stripeHandledRef = useRef(false);

  // All data and computed values from centralized hook
  // Must be declared before effects that use it
  const data = useMarketsPageData();

  // Sync URL params with tab state (only when URL changes externally)
  // Intentionally excludes activeTab from deps to avoid feedback loop:
  // - URL change → state update (this effect)
  // - State change → URL update (handleTabChange)
  // biome-ignore lint/correctness/useExhaustiveDependencies: One-way sync from URL to state
  useEffect(() => {
    const urlTab = parseTabFromParams(searchParams);
    if (urlTab !== activeTab) {
      startTransition(() => {
        setActiveTab(urlTab);
      });
    }
  }, [searchParams]);

  // Handle Stripe Checkout success/cancel redirects
  // When user returns from Stripe, show appropriate toast and clean URL
  useEffect(() => {
    // Prevent re-entry if already handled (can happen before router.replace completes)
    if (stripeHandledRef.current) return;

    const stripeSuccess = searchParams.get('stripe_success');
    const stripeCancelled = searchParams.get('stripe_cancelled');

    if (stripeSuccess === 'true') {
      stripeHandledRef.current = true;
      // Payment received - points are credited via webhook asynchronously
      // Message is conservative since webhook timing is not guaranteed
      const showToast = () => {
        toast.success(
          'Payment received! Your points will be credited shortly.',
          {
            duration: 5000,
            description: 'Your balance will update automatically.',
          }
        );
        // Trigger balance refresh to update UI
        data.triggerBalanceRefresh();
      };
      // Small delay to allow webhook to complete (typically < 1 second)
      const timeout = setTimeout(showToast, 1000);

      // Clean up URL params after showing toast
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_success');
      url.searchParams.delete('session_id');
      router.replace(url.pathname + url.search, { scroll: false });

      return () => clearTimeout(timeout);
    } else if (stripeCancelled === 'true') {
      stripeHandledRef.current = true;
      // User cancelled checkout
      toast.info('Checkout cancelled. No payment was made.');
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_cancelled');
      router.replace(url.pathname + url.search, { scroll: false });
    }
    return undefined;
  }, [searchParams, router, data]);

  // Handle tab change with URL update - uses startTransition for smooth UX
  const handleTabChange = useCallback(
    (tab: MarketTab) => {
      // Use startTransition to mark this as a non-urgent update
      // This prevents flickering by allowing React to keep showing old content
      startTransition(() => {
        setActiveTab(tab);
      });
      // Update URL without full navigation
      const url = tab === 'dashboard' ? '/markets' : `/markets?tab=${tab}`;
      router.replace(url, { scroll: false });
    },
    [router]
  );

  // Navigation handlers - memoized to prevent child re-renders
  const handleMarketClick = useCallback(
    (market: PerpMarket) => {
      router.push(`/markets/perps/${market.ticker}?from=dashboard`);
    },
    [router]
  );

  const handlePerpsTabMarketNavigation = useCallback(
    (market: PerpMarket) => {
      router.push(`/markets/perps/${market.ticker}?from=perps`);
    },
    [router]
  );

  const handlePredictionClick = useCallback(
    (prediction: PredictionMarket) => {
      router.push(`/markets/predictions/${prediction.id}?from=dashboard`);
    },
    [router]
  );

  const handlePredictionNavigation = useCallback(
    (prediction: PredictionMarket) => {
      router.push(`/markets/predictions/${prediction.id}?from=predictions`);
    },
    [router]
  );

  // Modal handlers - memoized to prevent child re-renders
  const handleShowPnLShare = useCallback(() => setShowPnLShareModal(true), []);
  const handleClosePnLShare = useCallback(
    () => setShowPnLShareModal(false),
    []
  );
  const handleShowBuyPoints = useCallback(
    () => setShowBuyPointsModal(true),
    []
  );
  const handleCloseBuyPoints = useCallback(
    () => setShowBuyPointsModal(false),
    []
  );
  const handleShowPerpsPnLShare = useCallback(
    () => setShowCategoryPnLShareModal('perps'),
    []
  );
  const handleShowPredictionsPnLShare = useCallback(
    () => setShowCategoryPnLShareModal('predictions'),
    []
  );
  const handleCloseCategoryPnLShare = useCallback(
    () => setShowCategoryPnLShareModal(null),
    []
  );

  // Quick Trade Handler
  const handleTradeAction = useCallback(
    (market: PerpMarket | PredictionMarketWithPosition, side: string) => {
      // 1. Select the market
      if ('ticker' in market) {
        setSelectedMarket({
          type: 'perp',
          market,
          side: side as 'long' | 'short',
        });
      } else {
        setSelectedMarket({
          type: 'prediction',
          market,
          side: side as 'yes' | 'no',
        });
      }
      // 2. Ensure we are in Order Entry mode (if we had hidden it, though layout is persistent on Desktop)
      // On mobile, this should navigate to detail page with side param ideally.
      // For this task, we assume Desktop usage mainly or simple navigation.
    },
    []
  );

  const handlePerpsQuickTradeMobile = useCallback(
    (market: PerpMarket, side: 'long' | 'short') => {
      router.push(
        `/markets/perps/${market.ticker}?from=perps&side=${encodeURIComponent(side)}`
      );
    },
    [router]
  );

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Favorites Filter (Future)

      // Search Focus (/)
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]');
        if (searchInput instanceof HTMLInputElement) {
          searchInput.focus();
        }
      }

      // Clear Selection / Blur (Esc)
      if (e.key === 'Escape') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setSelectedMarket(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  if (data.loading) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="space-y-6 p-4">
          <div className="flex gap-0">
            {['Dashboard', 'Perps', 'Predictions'].map((tab) => (
              <div key={tab} className="flex-1 px-4 py-2.5">
                <Skeleton className="mx-auto h-5 w-20" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <WidgetPanelSkeleton />
            <WidgetPanelSkeleton />
          </div>
          <WidgetPanelSkeleton />
        </div>
      </PageContainer>
    );
  }

  // Render active tab content
  const renderTabContent = (isMobile: boolean) => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTabContent
            authenticated={data.authenticated}
            onLogin={data.login}
            portfolioPnL={data.portfolioPnL}
            portfolioLoading={data.portfolioLoading}
            onShowPnLShare={handleShowPnLShare}
            onShowBuyPoints={handleShowBuyPoints}
            perpPositions={data.perpPositions}
            predictionPositions={data.predictionPositions}
            onPositionClosed={data.handlePositionsRefresh}
            onPositionSold={data.handlePositionsRefresh}
            trendingMarkets={data.trendingMarkets}
            topPredictions={data.topPredictions}
            onMarketClick={handleMarketClick}
            onPredictionClick={handlePredictionClick}
          />
        );
      case 'perps':
        return (
          <PerpsTabContent
            authenticated={data.authenticated}
            perpPnLData={data.perpPnLData}
            portfolioLoading={data.portfolioLoading}
            portfolioError={data.portfolioError}
            portfolioUpdatedAt={data.portfolioUpdatedAt}
            onShowCategoryPnLShare={handleShowPerpsPnLShare}
            onRefreshPortfolio={data.refreshPortfolio}
            perpPositions={data.perpPositions}
            onPositionClosed={data.handlePositionsRefresh}
            filteredMarkets={data.filteredPerpMarkets}
            onMarketClick={
              isMobile ? handlePerpsTabMarketNavigation : handleMarketSelect
            }
            selectedMarketTicker={
              selectedMarket?.type === 'perp'
                ? selectedMarket.market.ticker
                : null
            }
            onMarketSelect={handleMarketSelect}
            onTradeAction={
              isMobile ? handlePerpsQuickTradeMobile : handleTradeAction
            }
          />
        );
      case 'predictions':
        return (
          <PredictionsTabContent
            authenticated={data.authenticated}
            predictionPnLData={data.predictionPnLData}
            portfolioLoading={data.portfolioLoading}
            portfolioError={data.portfolioError}
            portfolioUpdatedAt={data.portfolioUpdatedAt}
            onShowCategoryPnLShare={handleShowPredictionsPnLShare}
            onRefreshPortfolio={data.refreshPortfolio}
            predictionPositions={data.predictionPositions}
            onPositionSold={data.handlePositionsRefresh}
            predictionSort={data.predictionSort}
            onSortChange={data.setPredictionSort}
            activePredictions={data.activePredictions}
            resolvedPredictions={data.resolvedPredictions}
            onPredictionClick={
              isMobile ? handlePredictionNavigation : handlePredictionClick
            }
            predictionsError={data.predictionsError}
            compact={isMobile}
          />
        );
    }
  };

  return (
    <PageContainer
      noPadding
      className="flex h-[calc(100vh-theme(spacing.16))] flex-col"
    >
      {/* Desktop Layout (Terminal) */}
      <div className="hidden flex-1 overflow-hidden bg-background/20 xl:flex">
        {activeTab === 'perps' ? (
          <PerpsTradingTerminal
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (
          <>
            {/* Left Panel: Navigation & Table */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-white/5 border-r">
              {/* Header */}
              <div className="sticky top-0 z-10 flex-shrink-0 bg-background/80 backdrop-blur-md">
                <div className="flex items-center justify-between border-white/5 border-b px-4 py-3">
                  <MarketsToggle
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    balance={data.portfolioPnL?.available}
                    authenticated={data.authenticated}
                    loading={data.portfolioLoading}
                  />
                  {activeTab !== 'dashboard' && (
                    <div className="w-[300px]">
                      <MarketsSearchInput
                        value={data.searchQuery}
                        onChange={data.setSearchQuery}
                        activeTab={activeTab}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Content (Table) */}
              <div
                className={`flex-1 overflow-y-auto p-4 transition-opacity duration-150 ${
                  isPending ? 'opacity-80' : 'opacity-100'
                }`}
              >
                {renderTabContent(false)}

                {!data.authenticated && activeTab !== 'dashboard' && (
                  <div className="flex justify-center p-8">
                    <LoginPrompt onLogin={data.login} />
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Order Entry & Aux (Positions later) */}
            {activeTab !== 'dashboard' && selectedMarket && (
              <div className="flex w-[380px] flex-col border-white/5 border-l bg-background/30 backdrop-blur-sm">
                <OrderEntryPanel
                  selectedMarket={selectedMarket}
                  onTradeClick={handleOrderEntryTrade}
                  onClose={() => setSelectedMarket(null)}
                  className="flex-1"
                />
                {/* Positions Panel (Bottom Right) */}
                <div className="min-h-[250px] flex-1 overflow-hidden border-white/5 border-t bg-background/30">
                  <PositionsPanel
                    activeTab={activeTab}
                    perpPositions={data.perpPositions}
                    predictionPositions={data.predictionPositions}
                    onPositionClosed={data.handlePositionsRefresh}
                    onPositionSold={data.handlePositionsRefresh}
                    className="h-full"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile/Tablet Layout */}
      <div className="flex flex-1 flex-col overflow-hidden xl:hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 flex-shrink-0 bg-background shadow-sm">
          <div className="px-3 sm:px-4">
            <MarketsToggle
              activeTab={activeTab}
              onTabChange={handleTabChange}
              balance={data.portfolioPnL?.available}
              authenticated={data.authenticated}
              loading={data.portfolioLoading}
            />
          </div>
          {activeTab !== 'dashboard' && (
            <div className="px-3 pb-3 sm:px-4">
              <MarketsSearchInput
                value={data.searchQuery}
                onChange={data.setSearchQuery}
                activeTab={activeTab}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div
          className={`flex-1 overflow-y-auto transition-opacity duration-150 ${
            isPending ? 'opacity-80' : 'opacity-100'
          }`}
        >
          {renderTabContent(true)}
        </div>

        {/* Login prompt for non-dashboard tabs */}
        {!data.authenticated && activeTab !== 'dashboard' && (
          <LoginPrompt onLogin={data.login} />
        )}
      </div>

      {/* Lazy loaded modals */}
      {showPnLShareModal && (
        <PortfolioPnLShareModal
          isOpen={showPnLShareModal}
          onClose={handleClosePnLShare}
          data={data.portfolioPnL}
          user={data.user ?? null}
          lastUpdated={data.portfolioUpdatedAt}
        />
      )}

      {showCategoryPnLShareModal === 'perps' && (
        <CategoryPnLShareModal
          isOpen={true}
          onClose={handleCloseCategoryPnLShare}
          category="perps"
          data={data.perpPnLData}
          user={data.user ?? null}
          lastUpdated={data.portfolioUpdatedAt}
        />
      )}

      {showCategoryPnLShareModal === 'predictions' && (
        <CategoryPnLShareModal
          isOpen={true}
          onClose={handleCloseCategoryPnLShare}
          category="predictions"
          data={data.predictionPnLData}
          user={data.user ?? null}
          lastUpdated={data.portfolioUpdatedAt}
        />
      )}

      {showBuyPointsModal && (
        <BuyPointsModal
          isOpen={showBuyPointsModal}
          onClose={handleCloseBuyPoints}
          onSuccess={() => {
            data.triggerBalanceRefresh();
            data.refetchData();
          }}
        />
      )}
    </PageContainer>
  );
}
