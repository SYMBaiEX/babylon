'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Hammer,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { WalletTransaction } from '@/stores/onchainWalletStore';
import { WalletEmptyState } from './WalletEmptyState';

interface TransactionHistoryProps {
  transactions: WalletTransaction[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  walletAddress: string;
}

export function TransactionHistory({
  transactions,
  loading,
  error,
  onRefresh,
  walletAddress,
}: TransactionHistoryProps) {
  if (loading && transactions.length === 0) {
    return <TransactionHistorySkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
        <p className="mb-2 font-medium text-red-500 text-sm">
          Failed to load transactions
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

  if (transactions.length === 0 && !loading) {
    return (
      <WalletEmptyState
        title="No activity yet"
        description="Your transaction history will appear here once you start using your wallet."
      />
    );
  }

  const grouped = groupTransactionsByDate(transactions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Activity</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {grouped.map(({ date, items }) => (
        <div key={date}>
          <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {date}
          </p>
          <div className="space-y-1">
            {items.map((tx) => (
              <TransactionRow
                key={tx.txHash}
                tx={tx}
                walletAddress={walletAddress}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionRow({
  tx,
  walletAddress,
}: {
  tx: WalletTransaction;
  walletAddress: string;
}) {
  const isSend = tx.from.toLowerCase() === walletAddress.toLowerCase();
  const Icon = getTransactionIcon(tx.type, isSend);
  const label = getTransactionLabel(tx.type, isSend);
  const counterparty = isSend ? tx.to : tx.from;
  const truncatedCounterparty = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`;
  const time = new Date(tx.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full ${
          isSend ? 'bg-red-500/10' : 'bg-green-500/10'
        }`}
      >
        <Icon
          className={`h-4 w-4 ${isSend ? 'text-red-500' : 'text-green-500'}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm">{label}</span>
          {tx.status === 'pending' && (
            <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-500">
              Pending
            </span>
          )}
          {tx.status === 'failed' && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-500 text-xs">
              Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">
            {isSend ? 'To' : 'From'} {truncatedCounterparty}
          </span>
          <span className="text-muted-foreground text-xs">{time}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-right">
        {tx.token && (
          <div>
            <span
              className={`font-mono text-sm ${
                isSend ? 'text-red-500' : 'text-green-500'
              }`}
            >
              {isSend ? '-' : '+'}
              {formatTxValue(tx.value, tx.token.decimals)} {tx.token.symbol}
            </span>
          </div>
        )}
        {tx.nft && (
          <div>
            <span className="text-foreground text-sm">{tx.nft.name}</span>
          </div>
        )}
        {!tx.token && !tx.nft && tx.value !== '0' && (
          <div>
            <span
              className={`font-mono text-sm ${
                isSend ? 'text-red-500' : 'text-green-500'
              }`}
            >
              {isSend ? '-' : '+'}
              {formatTxValue(tx.value, 18)} ETH
            </span>
          </div>
        )}
        {tx.explorerUrl && (
          <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="View on explorer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function getTransactionIcon(type: string, isSend: boolean) {
  switch (type) {
    case 'send':
      return ArrowUpRight;
    case 'receive':
      return ArrowDownLeft;
    case 'mint':
      return Hammer;
    case 'approve':
      return ShieldCheck;
    default:
      return isSend ? ArrowUpRight : FileText;
  }
}

function getTransactionLabel(type: string, isSend: boolean): string {
  switch (type) {
    case 'send':
      return 'Sent';
    case 'receive':
      return 'Received';
    case 'mint':
      return 'Minted';
    case 'approve':
      return 'Approved';
    case 'contract_interaction':
      return isSend ? 'Contract Call' : 'Contract Interaction';
    default:
      return isSend ? 'Sent' : 'Received';
  }
}

function formatTxValue(rawValue: string, decimals: number): string {
  const raw = BigInt(rawValue);
  if (raw === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  if (remainder === 0n) return whole.toString();
  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmed = remainderStr.slice(0, 6).replace(/0+$/, '');
  if (!trimmed) return whole.toString();
  return `${whole}.${trimmed}`;
}

function groupTransactionsByDate(
  transactions: WalletTransaction[]
): { date: string; items: WalletTransaction[] }[] {
  const groups = new Map<string, WalletTransaction[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const tx of transactions) {
    const txDate = new Date(tx.timestamp).toDateString();
    let label: string;
    if (txDate === today) {
      label = 'Today';
    } else if (txDate === yesterday) {
      label = 'Yesterday';
    } else {
      label = new Date(tx.timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const existing = groups.get(label);
    if (existing) {
      existing.push(tx);
    } else {
      groups.set(label, [tx]);
    }
  }

  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

function TransactionHistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-16 animate-pulse rounded bg-muted" />
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg p-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
