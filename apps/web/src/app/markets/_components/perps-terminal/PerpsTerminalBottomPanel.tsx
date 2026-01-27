'use client';

import { cn } from '@babylon/shared';
import { Minus } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { AssetTradesFeed } from '@/components/markets/AssetTradesFeed';
import { PerpPositionsList } from '@/components/markets/PerpPositionsList';
import { useAuth } from '@/hooks/useAuth';
import { invalidatePerpMarketsCache } from '@/stores/perpMarketsStore';
import {
  invalidateUserPositions,
  usePerpPositions,
} from '@/stores/userPositionsStore';
import { invalidateWalletBalance } from '@/stores/walletBalanceStore';

interface PerpsTerminalBottomPanelProps {
  ticker: string | null;
  activeTab: 'positions' | 'trades';
  onTabChange: (tab: 'positions' | 'trades') => void;
  onCollapse: () => void;
}

export function PerpsTerminalBottomPanel({
  ticker,
  activeTab,
  onTabChange,
  onCollapse,
}: PerpsTerminalBottomPanelProps) {
  const { user, authenticated } = useAuth();
  const userId = authenticated ? (user?.id ?? null) : null;

  const { positions: perpPositions, refresh: refreshUserPositions } =
    usePerpPositions(userId);

  const filteredPositions = useMemo(() => {
    if (!ticker) return [];
    return perpPositions.filter(
      (p) => p.ticker.toLowerCase() === ticker.toLowerCase() && !p.closedAt
    );
  }, [perpPositions, ticker]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const handlePositionClosed = async () => {
    invalidatePerpMarketsCache();
    invalidateUserPositions();
    invalidateWalletBalance();
    await refreshUserPositions();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-white/5 border-b bg-background/30 px-2">
        <div className="scrollbar-hide flex min-w-0 flex-1 overflow-x-auto">
          <TabButton
            active={activeTab === 'positions'}
            onClick={() => onTabChange('positions')}
          >
            Positions
            {ticker && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted/20 px-1.5 text-[10px] tabular-nums">
                {filteredPositions.length}
              </span>
            )}
          </TabButton>
          <TabButton
            active={activeTab === 'trades'}
            onClick={() => onTabChange('trades')}
          >
            Trades
          </TabButton>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          className="ml-2 rounded p-2 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          aria-label="Collapse bottom panel"
        >
          <Minus size={14} />
        </button>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
        {!ticker ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Select a market to see positions and trades.
          </div>
        ) : !authenticated ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Log in to view your positions.
          </div>
        ) : activeTab === 'positions' ? (
          <div className="h-full overflow-auto">
            {filteredPositions.length > 0 ? (
              <PerpPositionsList
                positions={filteredPositions}
                onPositionClosed={handlePositionClosed}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                No open positions
              </div>
            )}
          </div>
        ) : (
          <div className="h-full">
            <AssetTradesFeed
              marketType="perp"
              assetId={ticker}
              containerRef={containerRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-4 py-2 font-semibold text-xs transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
