'use client';

import type { PerpPosition } from '@babylon/shared';
import { CategoryPnLCard } from '@/components/markets/CategoryPnLCard';
import { PerpPositionsList } from '@/components/markets/PerpPositionsList';
import type { PerpMarket } from '@/types/markets';
import type { CategoryPnLData } from '../../_hooks';
import { PerpMarketCard } from '../cards';

interface PerpsTabContentProps {
  // Auth state
  authenticated: boolean;

  // P&L data
  perpPnLData: CategoryPnLData | null;
  portfolioLoading: boolean;
  portfolioError: string | null;
  portfolioUpdatedAt: number | null;
  onShowCategoryPnLShare: () => void;
  onRefreshPortfolio: () => Promise<void>;

  // Positions
  perpPositions: PerpPosition[];
  onPositionClosed: () => Promise<void>;

  // Markets
  filteredMarkets: PerpMarket[];
  onMarketClick: (market: PerpMarket) => void;
}

/**
 * Perps tab content component.
 * Shows category P&L, user positions, and all available perp markets.
 */
export function PerpsTabContent({
  authenticated,
  perpPnLData,
  portfolioLoading,
  portfolioError,
  portfolioUpdatedAt,
  onShowCategoryPnLShare,
  onRefreshPortfolio,
  perpPositions,
  onPositionClosed,
  filteredMarkets,
  onMarketClick,
}: PerpsTabContentProps) {
  return (
    <div
      id="perps-panel"
      role="tabpanel"
      aria-labelledby="perps-tab"
      className="p-4"
    >
      {authenticated && perpPnLData && (
        <div className="mb-6">
          <CategoryPnLCard
            category="perps"
            data={perpPnLData}
            loading={portfolioLoading}
            error={portfolioError}
            onShare={onShowCategoryPnLShare}
            onRefresh={onRefreshPortfolio}
            lastUpdated={portfolioUpdatedAt}
          />
        </div>
      )}

      {authenticated && perpPositions.length > 0 && (
        <>
          <h2 className="mb-3 font-bold text-muted-foreground text-sm">
            YOUR POSITIONS ({perpPositions.length})
          </h2>
          <div className="mb-6">
            <PerpPositionsList
              positions={perpPositions}
              onPositionClosed={onPositionClosed}
            />
          </div>
        </>
      )}

      <h2 className="mb-3 font-bold text-muted-foreground text-sm">
        ALL MARKETS
      </h2>
      <div className="space-y-2">
        {filteredMarkets.map((market, idx) => (
          <PerpMarketCard
            key={`market-${market.ticker}-${idx}`}
            market={market}
            onClick={onMarketClick}
          />
        ))}
      </div>
    </div>
  );
}
