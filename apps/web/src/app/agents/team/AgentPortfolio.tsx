'use client';

import { cn } from '@babylon/shared';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ExternalLink,
  History,
  Loader2,
  Shield,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useAgent0Reputation } from '@/hooks/useAgent0Reputation';
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

  // Agent0 reputation
  const { profile: agent0Profile, isAgent0Available } =
    useAgent0Reputation(agentId);

  // Fetch balance, transactions, and agent stats
  const fetchData = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    setWalletLoading(true);

    try {
      // Fetch wallet data
      const walletRes = await fetch(`/api/agents/${agentId}/trading-balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (walletRes.ok) {
        const data = await walletRes.json();
        if (data.success) {
          setBalanceInfo({
            agentBalance: data.agentBalance.tradingBalance,
            userBalance: data.userBalance,
            lifetimePnL: data.agentBalance.lifetimePnL,
            totalDeposited: data.agentBalance.totalDeposited || 0,
            totalWithdrawn: data.agentBalance.totalWithdrawn || 0,
          });
          setTransactions(data.transactions || []);
        }
      }

      // Fetch agent stats
      const agentRes = await fetch(`/api/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (agentRes.ok) {
        const data = await agentRes.json();
        if (data.agent) {
          setAgentStats({
            totalTrades: data.agent.totalTrades || 0,
            profitableTrades: data.agent.profitableTrades || 0,
            winRate: data.agent.winRate || 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch portfolio data:', err);
    } finally {
      setWalletLoading(false);
    }
  }, [agentId, getAccessToken]);

  useEffect(() => {
    fetchData();
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
        const error = await res.json();
        throw new Error(error.error || 'Transaction failed');
      }

      const data = await res.json();
      toast.success(data.message);
      setAmount('');
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Transaction failed'
      );
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
    <div className="flex h-full gap-4 p-4">
      {/* Left Column - Balance & P&L Overview */}
      <div className="flex w-72 shrink-0 flex-col gap-3">
        {/* Balance Card */}
        <div className="rounded-lg border border-[#0066FF]/30 bg-[#0066FF]/5 p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[#0066FF] text-xs">
              <Wallet className="h-3.5 w-3.5" />
              Balance
            </div>
            <span className="truncate font-medium text-foreground text-xs">
              {agentName}
            </span>
          </div>
          <div className="font-bold text-2xl">
            {balanceInfo.agentBalance.toFixed(2)} pts
          </div>
        </div>

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
            <div className="text-[10px] text-muted-foreground">
              Open Positions
            </div>
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

      {/* Middle Column - Transfer */}
      <div className="w-64 shrink-0 space-y-3">
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-sm">Transfer</span>
            <span className="text-muted-foreground text-xs">
              Your: {balanceInfo.userBalance.toFixed(2)} pts
            </span>
          </div>

          {/* Action Toggle */}
          <div className="mb-2 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setAction('deposit')}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md py-1.5 font-medium text-xs transition-all',
                action === 'deposit'
                  ? 'bg-[#0066FF] text-white'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              )}
            >
              <ArrowDownToLine className="h-3 w-3" />
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setAction('withdraw')}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md py-1.5 font-medium text-xs transition-all',
                action === 'withdraw'
                  ? 'bg-[#0066FF] text-white'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              )}
            >
              <ArrowUpFromLine className="h-3 w-3" />
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
              className="h-8 flex-1 text-sm"
            />
            <button
              type="button"
              onClick={handleTransaction}
              disabled={processing || !amount}
              className="h-8 rounded-md bg-[#0066FF] px-3 font-medium text-white text-xs transition-all hover:bg-[#0055DD] disabled:opacity-50"
            >
              {processing ? '...' : 'Go'}
            </button>
          </div>
        </div>

        {/* Agent0 Reputation - Compact */}
        {isAgent0Available && agent0Profile && (
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1 font-medium text-xs">
                <Shield className="h-3 w-3 text-[#0066FF]" />
                Agent0 Network
              </span>
              <a
                href={`https://agent0.network/agent/${agent0Profile.tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-[#0066FF]"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Accuracy</span>
                <div className="font-semibold text-[#0066FF]">
                  {agent0Profile.reputation?.accuracyScore.toFixed(1) ?? '—'}%
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Trust</span>
                <div className="font-semibold text-green-600">
                  {agent0Profile.reputation?.trustScore.toFixed(1) ?? '—'}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Transaction History */}
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            <span className="font-medium text-sm">Recent Transactions</span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-xs">
              No transactions yet
            </div>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {transactions.slice(0, 10).map((tx) => {
                const isExpanded = expandedTxIds.has(tx.id);
                return (
                  <div key={tx.id} className="rounded bg-muted/30 text-xs">
                    {/* Collapsed row - clickable */}
                    <button
                      type="button"
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
