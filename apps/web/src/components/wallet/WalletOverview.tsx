'use client';

import { ArrowDownLeft, ArrowUpRight, Coins } from 'lucide-react';
import type {
  NativeBalance,
  TokenBalance,
  WalletTransaction,
} from '@/stores/onchainWalletStore';
import type { WalletTab } from './WalletTabs';

interface WalletOverviewProps {
  nativeBalance: NativeBalance | null;
  tokens: TokenBalance[];
  transactions: WalletTransaction[];
  loading: boolean;
  onNavigateTab: (tab: WalletTab) => void;
  onSend?: () => void;
  onReceive?: () => void;
}

export function WalletOverview({
  nativeBalance,
  tokens,
  transactions,
  loading,
  onNavigateTab,
  onSend,
  onReceive,
}: WalletOverviewProps) {
  const totalUsdValue = calculateTotalUsd(nativeBalance, tokens);

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="rounded-xl border border-border bg-linear-to-br from-[#0066FF]/5 to-transparent p-6">
        <p className="mb-1 text-muted-foreground text-sm">Total Balance</p>
        {loading && !nativeBalance ? (
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        ) : totalUsdValue !== null ? (
          <p className="font-bold text-3xl text-foreground">${totalUsdValue}</p>
        ) : (
          <div className="flex items-center gap-2">
            {nativeBalance && (
              <p className="font-bold text-2xl text-foreground">
                {formatBalance(nativeBalance.balance, nativeBalance.decimals)}{' '}
                {nativeBalance.symbol}
              </p>
            )}
            {!nativeBalance && (
              <p className="font-bold text-2xl text-muted-foreground">--</p>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-4 flex gap-3">
          {onSend && (
            <button
              onClick={onSend}
              className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-colors hover:bg-foreground/90"
            >
              <ArrowUpRight className="h-4 w-4" />
              Send
            </button>
          )}
          {onReceive && (
            <button
              onClick={onReceive}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-muted"
            >
              <ArrowDownLeft className="h-4 w-4" />
              Receive
            </button>
          )}
        </div>
      </div>

      {/* Token Summary */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">Assets</h3>
          <button
            onClick={() => onNavigateTab('tokens')}
            className="text-[#0066FF] text-xs hover:underline"
          >
            View all
          </button>
        </div>
        <div className="space-y-1">
          {nativeBalance && BigInt(nativeBalance.balance) > 0n && (
            <OverviewTokenRow
              symbol={nativeBalance.symbol}
              balance={formatBalance(
                nativeBalance.balance,
                nativeBalance.decimals
              )}
              usdValue={nativeBalance.usdValue}
            />
          )}
          {tokens
            .filter((t) => BigInt(t.balance) > 0n)
            .slice(0, 3)
            .map((token) => (
              <OverviewTokenRow
                key={token.address}
                symbol={token.symbol}
                balance={formatBalance(token.balance, token.decimals)}
                usdValue={token.usdValue}
                logoUrl={token.logoUrl}
              />
            ))}
          {!nativeBalance && tokens.length === 0 && !loading && (
            <p className="py-4 text-center text-muted-foreground text-sm">
              No assets found
            </p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">
            Recent Activity
          </h3>
          {transactions.length > 0 && (
            <button
              onClick={() => onNavigateTab('activity')}
              className="text-[#0066FF] text-xs hover:underline"
            >
              View all
            </button>
          )}
        </div>
        {transactions.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">
            No recent activity
          </p>
        ) : (
          <div className="space-y-1">
            {transactions.slice(0, 5).map((tx) => (
              <div
                key={tx.txHash}
                className="flex items-center gap-3 rounded-lg p-2 text-sm"
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    tx.type === 'send' ? 'bg-red-500/10' : 'bg-green-500/10'
                  }`}
                >
                  {tx.type === 'send' ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-green-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground text-xs">
                    {tx.type === 'send'
                      ? 'Sent'
                      : tx.type === 'receive'
                        ? 'Received'
                        : tx.type === 'mint'
                          ? 'Minted'
                          : 'Transaction'}
                  </span>
                  <p className="truncate text-muted-foreground text-xs">
                    {new Date(tx.timestamp).toLocaleDateString()}
                  </p>
                </div>
                {tx.token && (
                  <span className="font-mono text-foreground text-xs">
                    {formatBalance(tx.value, tx.token.decimals)}{' '}
                    {tx.token.symbol}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTokenRow({
  symbol,
  balance,
  usdValue,
  logoUrl,
}: {
  symbol: string;
  balance: string;
  usdValue: string | null;
  logoUrl?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
        {logoUrl ? (
          <img src={logoUrl} alt={symbol} className="h-5 w-5 rounded-full" />
        ) : (
          <Coins className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1">
        <span className="font-medium text-foreground text-sm">{symbol}</span>
      </div>
      <div className="text-right">
        <p className="font-mono text-foreground text-sm">{balance}</p>
        {usdValue && (
          <p className="text-muted-foreground text-xs">${usdValue}</p>
        )}
      </div>
    </div>
  );
}

function formatBalance(rawBalance: string, decimals: number): string {
  const raw = BigInt(rawBalance);
  if (raw === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  if (remainder === 0n) return whole.toString();
  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmed = remainderStr.slice(0, 4).replace(/0+$/, '');
  if (!trimmed) return whole.toString();
  return `${whole}.${trimmed}`;
}

function calculateTotalUsd(
  nativeBalance: NativeBalance | null,
  tokens: TokenBalance[]
): string | null {
  let hasAnyPrice = false;
  let total = 0;

  if (nativeBalance?.usdValue) {
    total += parseFloat(nativeBalance.usdValue);
    hasAnyPrice = true;
  }

  for (const token of tokens) {
    if (token.usdValue) {
      total += parseFloat(token.usdValue);
      hasAnyPrice = true;
    }
  }

  if (!hasAnyPrice) return null;
  return total.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
