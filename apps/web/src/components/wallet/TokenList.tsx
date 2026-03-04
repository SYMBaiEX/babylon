'use client';

import { ArrowUpRight, Coins, RefreshCw } from 'lucide-react';
import type { NativeBalance, TokenBalance } from '@/stores/onchainWalletStore';
import { WalletEmptyState } from './WalletEmptyState';

interface TokenListProps {
  nativeBalance: NativeBalance | null;
  tokens: TokenBalance[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSend?: (tokenAddress?: string) => void;
  onFund?: () => void;
}

export function TokenList({
  nativeBalance,
  tokens,
  loading,
  error,
  onRefresh,
  onSend,
  onFund,
}: TokenListProps) {
  if (loading && !nativeBalance && tokens.length === 0) {
    return <TokenListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
        <p className="mb-2 font-medium text-red-500 text-sm">
          Failed to load token balances
        </p>
        <p className="mb-3 text-muted-foreground text-xs">{error}</p>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const hasAnyBalance =
    (nativeBalance && BigInt(nativeBalance.balance) > 0n) ||
    tokens.some((t) => BigInt(t.balance) > 0n);

  if (!hasAnyBalance && !loading) {
    return (
      <WalletEmptyState
        title="No tokens found"
        description="Fund your wallet to get started. You can buy or transfer tokens to this address."
        action={onFund ? { label: 'Fund Wallet', onClick: onFund } : undefined}
      />
    );
  }

  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          Token Balances
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          title="Refresh balances"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {nativeBalance && (
        <TokenRow
          symbol={nativeBalance.symbol}
          name="Ether"
          balance={formatTokenAmount(
            nativeBalance.balance,
            nativeBalance.decimals
          )}
          usdValue={nativeBalance.usdValue}
          onSend={onSend ? () => onSend(undefined) : undefined}
        />
      )}

      {tokens.map((token) => (
        <TokenRow
          key={token.address}
          symbol={token.symbol}
          name={token.name}
          balance={formatTokenAmount(token.balance, token.decimals)}
          usdValue={token.usdValue}
          logoUrl={token.logoUrl}
          onSend={onSend ? () => onSend(token.address) : undefined}
        />
      ))}
    </div>
  );
}

interface TokenRowProps {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string | null;
  logoUrl?: string;
  onSend?: () => void;
}

function TokenRow({
  symbol,
  name,
  balance,
  usdValue,
  logoUrl,
  onSend,
}: TokenRowProps) {
  return (
    <div className="group flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        {logoUrl ? (
          <img src={logoUrl} alt={symbol} className="h-6 w-6 rounded-full" />
        ) : (
          <Coins className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm">{symbol}</span>
          <span className="truncate text-muted-foreground text-xs">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-foreground text-sm">{balance}</span>
          {usdValue && (
            <span className="text-muted-foreground text-xs">${usdValue}</span>
          )}
        </div>
      </div>
      {onSend && (
        <button
          onClick={onSend}
          className="rounded-lg border border-border p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
          title={`Send ${symbol}`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function TokenListSkeleton() {
  return (
    <div className="space-y-1">
      <div className="mb-2 h-5 w-28 animate-pulse rounded bg-muted" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTokenAmount(rawBalance: string, decimals: number): string {
  const raw = BigInt(rawBalance);
  if (raw === 0n) return '0';

  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;

  if (remainder === 0n) return whole.toString();

  const remainderStr = remainder.toString().padStart(decimals, '0');
  // Show up to 6 significant decimal places, trim trailing zeros
  const trimmed = remainderStr.slice(0, 6).replace(/0+$/, '');
  if (!trimmed) return whole.toString();

  return `${whole}.${trimmed}`;
}
