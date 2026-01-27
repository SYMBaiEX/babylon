'use client';

import { cn } from '@babylon/shared';
import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { MarketsToggle } from '@/components/shared/MarketsToggle';
import { Skeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  usePerpMarkets,
  usePerpMarketsRealtime,
} from '@/stores/perpMarketsStore';
import { useUserPositionsPolling } from '@/stores/userPositionsStore';
import {
  useWalletBalance,
  useWalletBalancePolling,
} from '@/stores/walletBalanceStore';
import type { MarketTab, PerpMarket } from '@/types/markets';
import { PerpsMarketDetailPanel } from './PerpsMarketDetailPanel';
import { PerpsMarketListPanel } from './PerpsMarketListPanel';
import { PerpsOrderEntryPanel } from './PerpsOrderEntryPanel';
import { PerpsTerminalBottomPanel } from './PerpsTerminalBottomPanel';

interface PerpsTradingTerminalProps {
  activeTab: MarketTab;
  onTabChange: (tab: MarketTab) => void;
}

function pickDefaultMarket(markets: PerpMarket[]): PerpMarket | null {
  if (markets.length === 0) return null;
  const sorted = [...markets].sort(
    (a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)
  );
  return sorted[0] ?? null;
}

export function PerpsTradingTerminal({
  activeTab,
  onTabChange,
}: PerpsTradingTerminalProps) {
  const { user, authenticated } = useAuth();
  const { markets, loading, error } = usePerpMarkets();
  usePerpMarketsRealtime();

  const userId = authenticated ? (user?.id ?? null) : null;
  useUserPositionsPolling(userId);
  useWalletBalancePolling(userId);

  const { balance, loading: balanceLoading } = useWalletBalance(userId);

  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [bottomTab, setBottomTab] = useState<'positions' | 'trades'>(
    'positions'
  );

  const fallbackMarket = useMemo(() => pickDefaultMarket(markets), [markets]);

  useEffect(() => {
    if (activeTicker) return;
    if (!fallbackMarket) return;
    setActiveTicker(fallbackMarket.ticker);
  }, [activeTicker, fallbackMarket]);

  const activeMarket = useMemo(() => {
    if (!activeTicker) return null;
    return (
      markets.find(
        (m) => m.ticker.toLowerCase() === activeTicker.toLowerCase()
      ) ?? null
    );
  }, [markets, activeTicker]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Terminal header (keeps app navigation coherent while matching terminal density) */}
      <div className="flex h-10 shrink-0 items-center justify-between border-white/5 border-b bg-background/40 px-3 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center">
          <div className="min-w-0 flex-1">
            <MarketsToggle
              activeTab={activeTab}
              onTabChange={onTabChange}
              balance={balance}
              authenticated={authenticated}
              loading={balanceLoading}
            />
          </div>
        </div>

        <div className="ml-3 hidden items-center gap-2 text-muted-foreground text-xs md:flex">
          <button
            type="button"
            onClick={() => setLeftCollapsed((v) => !v)}
            className="rounded border border-white/10 bg-background/30 px-2 py-1 transition-colors hover:bg-muted/20 hover:text-foreground"
          >
            {leftCollapsed ? 'Show markets' : 'Hide markets'}
          </button>
          <button
            type="button"
            onClick={() => setRightCollapsed((v) => !v)}
            className="rounded border border-white/10 bg-background/30 px-2 py-1 transition-colors hover:bg-muted/20 hover:text-foreground"
          >
            {rightCollapsed ? 'Show trade' : 'Hide trade'}
          </button>
          <button
            type="button"
            onClick={() => setBottomCollapsed((v) => !v)}
            className="rounded border border-white/10 bg-background/30 px-2 py-1 transition-colors hover:bg-muted/20 hover:text-foreground"
          >
            {bottomCollapsed ? 'Show bottom' : 'Hide bottom'}
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {/* Left collapsed strip */}
        {leftCollapsed && (
          <button
            type="button"
            onClick={() => setLeftCollapsed(false)}
            className="w-9 shrink-0 border-white/5 border-r bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
            aria-label="Open markets panel"
          >
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="h-6 w-6 rounded bg-muted/30" />
              <span className="writing-vertical-lr rotate-180 font-semibold text-[10px] tracking-wider">
                MARKETS
              </span>
            </div>
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PanelGroup direction="vertical" className="flex min-h-0 flex-1">
            <Panel
              defaultSize={bottomCollapsed ? 100 : 70}
              minSize={35}
              className="min-h-0"
            >
              <PanelGroup direction="horizontal" className="min-h-0">
                {/* Left: Markets list */}
                {!leftCollapsed && (
                  <>
                    <Panel
                      defaultSize={22}
                      minSize={15}
                      maxSize={32}
                      className="min-h-0 border-white/5 border-r"
                    >
                      <div className="flex h-full min-h-0 flex-col bg-background/20">
                        {loading ? (
                          <div className="p-3">
                            <Skeleton className="h-8 w-full" />
                            <div className="mt-3 space-y-2">
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                            </div>
                          </div>
                        ) : error ? (
                          <div className="p-4 text-muted-foreground text-sm">
                            Failed to load markets.
                          </div>
                        ) : (
                          <PerpsMarketListPanel
                            markets={markets}
                            activeTicker={activeTicker}
                            onSelectTicker={setActiveTicker}
                            onCollapse={() => setLeftCollapsed(true)}
                          />
                        )}
                      </div>
                    </Panel>
                    <PanelResizeHandle className="w-1 bg-white/5 hover:bg-primary/40" />
                  </>
                )}

                {/* Center: Market detail + chart */}
                <Panel
                  defaultSize={leftCollapsed ? 72 : 56}
                  minSize={40}
                  className="min-h-0"
                >
                  <div className="h-full min-h-0 bg-background/10">
                    <PerpsMarketDetailPanel market={activeMarket} />
                  </div>
                </Panel>

                {/* Right: Order entry */}
                {!rightCollapsed && (
                  <>
                    <PanelResizeHandle className="w-1 bg-white/5 hover:bg-primary/40" />
                    <Panel
                      defaultSize={22}
                      minSize={18}
                      maxSize={32}
                      className="min-h-0 border-white/5 border-l bg-background/20"
                    >
                      <PerpsOrderEntryPanel market={activeMarket} />
                    </Panel>
                  </>
                )}

                {/* Right collapsed strip */}
                {rightCollapsed && (
                  <button
                    type="button"
                    onClick={() => setRightCollapsed(false)}
                    className="w-9 shrink-0 border-white/5 border-l bg-background/30 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                    aria-label="Open trade panel"
                  >
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <div className="h-6 w-6 rounded bg-muted/30" />
                      <span className="writing-vertical-lr rotate-180 font-semibold text-[10px] tracking-wider">
                        TRADE
                      </span>
                    </div>
                  </button>
                )}
              </PanelGroup>
            </Panel>

            {!bottomCollapsed && (
              <>
                <PanelResizeHandle className="h-1 bg-white/5 hover:bg-primary/40" />
                <Panel
                  defaultSize={30}
                  minSize={12}
                  className="min-h-0 border-white/5 border-t bg-background/20"
                >
                  <PerpsTerminalBottomPanel
                    ticker={activeMarket?.ticker ?? null}
                    activeTab={bottomTab}
                    onTabChange={setBottomTab}
                    onCollapse={() => setBottomCollapsed(true)}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>

          {bottomCollapsed && (
            <button
              type="button"
              onClick={() => setBottomCollapsed(false)}
              className={cn(
                'flex h-7 shrink-0 items-center justify-between border-white/5 border-t bg-background/40 px-4 text-muted-foreground',
                'transition-colors hover:bg-muted/20 hover:text-foreground'
              )}
            >
              <span className="font-semibold text-[10px] tracking-widest">
                POSITIONS & TRADES
              </span>
              <span className="text-[10px]">▲</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
