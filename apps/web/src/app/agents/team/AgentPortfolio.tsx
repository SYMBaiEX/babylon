'use client';

import { cn, logger } from '@babylon/shared';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  History,
  Loader2,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useAgentTotalPnL } from '@/hooks/useAgentTotalPnL';
import { useAuth } from '@/hooks/useAuth';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

/** Response from /api/agents/[agentId]/trading-balance */
interface WalletResponse {
  success: boolean;
  agentBalance: {
    tradingBalance: number;
    lifetimePnL: number;
    totalDeposited?: number;
    totalWithdrawn?: number;
  };
  userBalance: number;
  transactions?: Transaction[];
}

/** Typed response for POST trading-balance success */
interface TradingBalanceResponse {
  message: string;
  success?: boolean;
}

/** Typed error response */
interface ErrorResponse {
  error?: string;
}

/** Response from /api/agents/[agentId] */
interface AgentResponse {
  agent?: {
    totalTrades?: number;
    profitableTrades?: number;
    winRate?: number;
  };
}

interface AgentPortfolioProps {
  agentId: string;
  agentName: string;
}

/**
 * Merged Portfolio component combining Performance stats + Wallet functionality.
 * Optimized for the bottom panel with a compact, horizontal layout.
 */
export function AgentPortfolio({ agentId, agentName }: AgentPortfolioProps) {
  const { getAccessToken } = useAuth();

  // Wallet state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [processing, setProcessing] = useState(false);
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());
  const [balanceInfo, setBalanceInfo] = useState({
    agentBalance: 0,
    userBalance: 0,
    lifetimePnL: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
  });

  // Agent stats from API
  const [agentStats, setAgentStats] = useState({
    totalTrades: 0,
    profitableTrades: 0,
    winRate: 0,
  });

  // Use shared hook for P&L calculation
  const {
    realizedPnL,
    unrealizedPnL,
    totalPnL,
    pointsInPositions,
    isProfitable,
    loading: positionsLoading,
    predictions,
    perps,
  } = useAgentTotalPnL({
    agentId,
    availableBalance: balanceInfo.agentBalance,
    totalDeposited: balanceInfo.totalDeposited,
    totalWithdrawn: balanceInfo.totalWithdrawn,
    realizedPnL: balanceInfo.lifetimePnL.toString(),
  });

  // Fetch balance, transactions, and agent stats
  const fetchData = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setWalletLoading(false);
      return;
    }

    setWalletLoading(true);

    // Parallelize the two independent fetches
    const [walletRes, agentRes] = await Promise.all([
      fetch(`/api/agents/${agentId}/trading-balance`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]).finally(() => {
      setWalletLoading(false);
    });

    // Validate both responses before committing any state
    if (!walletRes.ok) {
      logger.error(
        'Failed to fetch wallet data',
        { agentId, status: walletRes.status },
        'AgentPortfolio'
      );
      throw new Error(`Failed to fetch wallet data: ${walletRes.status}`);
    }

    if (!agentRes.ok) {
      logger.error(
        'Failed to fetch agent stats',
        { agentId, status: agentRes.status },
        'AgentPortfolio'
      );
      throw new Error(`Failed to fetch agent stats: ${agentRes.status}`);
    }

    // Parse both responses after validation
    const walletData = (await walletRes.json()) as WalletResponse;
    const agentData = (await agentRes.json()) as AgentResponse;

    // Commit state only after both fetches are validated and parsed
    if (walletData.success) {
      setBalanceInfo({
        agentBalance: walletData.agentBalance.tradingBalance,
        userBalance: walletData.userBalance,
        lifetimePnL: walletData.agentBalance.lifetimePnL,
        totalDeposited: walletData.agentBalance.totalDeposited ?? 0,
        totalWithdrawn: walletData.agentBalance.totalWithdrawn ?? 0,
      });
      setTransactions(walletData.transactions ?? []);
    }

    if (agentData.agent) {
      setAgentStats({
        totalTrades: agentData.agent.totalTrades ?? 0,
        profitableTrades: agentData.agent.profitableTrades ?? 0,
        winRate: agentData.agent.winRate ?? 0,
      });
    }
  }, [agentId, getAccessToken]);

  useEffect(() => {
    fetchData().catch((err) => {
      logger.error(
        'Failed to fetch portfolio data',
        { error: err instanceof Error ? err.message : String(err) },
        'AgentPortfolio'
      );
    });
  }, [fetchData]);

  const handleTransaction = async () => {
    const amountNum = parseFloat(amount);

    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (action === 'deposit' && amountNum > balanceInfo.userBalance) {
      toast.error(
        `Insufficient balance. You have ${balanceInfo.userBalance.toFixed(2)} pts`
      );
      return;
    }
    if (action === 'withdraw' && amountNum > balanceInfo.agentBalance) {
      toast.error(
        `Insufficient agent balance. Agent has ${balanceInfo.agentBalance.toFixed(2)} pts`
      );
      return;
    }

    setProcessing(true);
    const token = await getAccessToken();
    if (!token) {
      setProcessing(false);
      toast.error('Authentication required');
      return;
    }

    try {
      const res = await fetch(`/api/agents/${agentId}/trading-balance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, amount: amountNum }),
      });

      if (!res.ok) {
        // Clone response to safely attempt JSON parsing first, then fallback to text
        const resClone = res.clone();
        let errorMessage = `Transaction failed (${res.status})`;

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorData = (await resClone.json()) as ErrorResponse;
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } else {
          const rawText = await res.text();
          if (rawText) {
            errorMessage = rawText;
          }
        }

        toast.error(errorMessage);
        return;
      }

      const data = (await res.json()) as TradingBalanceResponse;
      toast.success(data.message);
      setAmount('');
      await fetchData();
    } catch (error) {
      // Handle network errors and other exceptions from fetch
      const errorMessage =
        error instanceof Error ? error.message : 'Network error';
      toast.error(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  if (walletLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {/* Balance Card - Full width, compact */}
      <div className="rounded-lg border border-[#0066FF]/30 bg-[#0066FF]/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[#0066FF] text-xs">
              <Wallet className="h-3.5 w-3.5" />
              Balance
            </div>
            <div className="font-bold text-xl">
              {balanceInfo.agentBalance.toFixed(2)} pts
            </div>
          </div>
          <span className="truncate font-medium text-foreground text-xs">
            {agentName}
          </span>
        </div>
      </div>

      {/* P&L Summary + Quick Stats - Side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* P&L Summary */}
        <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total P&L</span>
            <span
              className={cn(
                'font-semibold',
                isProfitable ? 'text-green-600' : 'text-red-600'
              )}
            >
              {positionsLoading
                ? '...'
                : `${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Realized</span>
            <span
              className={cn(
                'font-medium',
                realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {realizedPnL >= 0 ? '+' : ''}
              {realizedPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Unrealized</span>
            <span
              className={cn(
                'font-medium',
                unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {positionsLoading
                ? '...'
                : `${unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)}`}
            </span>
          </div>
          <div className="border-border border-t pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">In Positions</span>
              <span className="font-medium">
                {positionsLoading ? '...' : pointsInPositions.toFixed(2)} pts
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Trades</div>
            <div className="font-semibold text-sm">
              {agentStats.totalTrades}
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Win Rate</div>
            <div className="font-semibold text-sm">
              {(agentStats.winRate * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Positions</div>
            <div className="font-semibold text-sm">
              {positionsLoading ? '...' : predictions.length + perps.length}
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Profitable</div>
            <div className="font-semibold text-green-600 text-sm">
              {agentStats.profitableTrades}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer + Transaction History - Stacked on small, side by side on wide */}
      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[280px_1fr]">
        {/* Transfer Section */}
        <div className="flex flex-col rounded-lg border border-border bg-card/50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium text-sm">Transfer</span>
            <span className="text-muted-foreground text-xs">
              Your: {balanceInfo.userBalance.toFixed(2)} pts
            </span>
          </div>

          {/* Action Toggle */}
          <div className="mb-3 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setAction('deposit')}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md py-2 font-medium text-xs transition-all',
                action === 'deposit'
                  ? 'bg-[#0066FF] text-white'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              )}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setAction('withdraw')}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md py-2 font-medium text-xs transition-all',
                action === 'withdraw'
                  ? 'bg-[#0066FF] text-white'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              )}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Withdraw
            </button>
          </div>

          {/* Amount input */}
          <div className="flex gap-2">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount..."
              min={0.01}
              step={0.01}
              className="h-9 flex-1 text-sm"
            />
            <button
              type="button"
              onClick={handleTransaction}
              disabled={processing || !amount}
              className="h-9 rounded-md bg-[#0066FF] px-4 font-medium text-sm text-white transition-all hover:bg-[#0055DD] disabled:opacity-50"
            >
              {processing ? '...' : 'Go'}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            <span className="font-medium text-sm">Recent Transactions</span>
          </div>

          {transactions.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground text-xs">
              No transactions yet
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {transactions.slice(0, 10).map((tx) => {
                const isExpanded = expandedTxIds.has(tx.id);
                return (
                  <div key={tx.id} className="rounded bg-muted/30 text-xs">
                    {/* Collapsed row - clickable */}
                    <button
                      type="button"
                      aria-expanded={expandedTxIds.has(tx.id)}
                      onClick={() => {
                        setExpandedTxIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tx.id)) {
                            next.delete(tx.id);
                          } else {
                            next.add(tx.id);
                          }
                          return next;
                        });
                      }}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-1">
                        <ChevronDown
                          className={cn(
                            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                            isExpanded && 'rotate-180'
                          )}
                        />
                        <span className="font-medium capitalize">
                          {tx.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'font-semibold',
                          tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {tx.amount > 0 ? '+' : ''}
                        {tx.amount.toFixed(2)}
                      </span>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-border border-t bg-muted/20 px-2 py-2 text-[11px]">
                        <div className="space-y-1">
                          {tx.description && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Description:
                              </span>
                              <span className="text-right">
                                {tx.description}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Balance After:
                            </span>
                            <span className="font-medium">
                              {tx.balanceAfter.toFixed(2)} pts
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Time:</span>
                            <span>
                              {new Date(tx.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
