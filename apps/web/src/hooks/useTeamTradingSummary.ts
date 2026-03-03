'use client';

import { logger } from '@babylon/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type TeamScope = 'owner_agents' | 'agents_only';

export interface TeamTotals {
  walletBalance: number;
  lifetimePnL: number;
  unrealizedPnL: number;
  currentPnL: number;
  openPositions: number;
}

export interface TeamMemberTradingSummary {
  /** Maps to EntityType for panel selection: owner → 'user', agent → 'agent' */
  entityType: 'owner' | 'agent';
  id: string;
  name: string;
  username: string | null;
  walletBalance: number;
  lifetimePnL: number;
  unrealizedPnL: number;
  currentPnL: number;
  openPositions: number;
}

export interface TeamTradingSummary {
  ownerId: string;
  ownerName: string;
  members: TeamMemberTradingSummary[]; // includes owner + agents
  totals: TeamTotals;
  agentsOnlyTotals: TeamTotals;
  updatedAt: string | null;
}

function toNumber(
  value: string | number | undefined | null,
  fallback = 0
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function sumMemberTotals(members: TeamMemberTradingSummary[]): TeamTotals {
  return members.reduce(
    (acc, m) => ({
      walletBalance: acc.walletBalance + m.walletBalance,
      lifetimePnL: acc.lifetimePnL + m.lifetimePnL,
      unrealizedPnL: acc.unrealizedPnL + m.unrealizedPnL,
      currentPnL: acc.currentPnL + m.currentPnL,
      openPositions: acc.openPositions + m.openPositions,
    }),
    {
      walletBalance: 0,
      lifetimePnL: 0,
      unrealizedPnL: 0,
      currentPnL: 0,
      openPositions: 0,
    }
  );
}

interface AgentsApiAgent {
  id: string;
  username?: string | null;
  name?: string | null;
  virtualBalance?: number;
  lifetimePnL?: string | number;
}

interface AgentsApiResponse {
  success: boolean;
  agents: AgentsApiAgent[];
}

interface UserBalanceApiResponse {
  balance: string;
  lifetimePnL: string;
}

type PositionWithUnrealizedPnL = {
  unrealizedPnL: number;
  isAgentPosition?: boolean;
  agentId?: string | null;
  resolved?: boolean;
  status?: string;
};

interface PositionsApiResponse {
  perpetuals?: {
    positions?: PositionWithUnrealizedPnL[];
  };
  predictions?: {
    positions?: PositionWithUnrealizedPnL[];
  };
  timestamp?: string;
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  if (e instanceof Error && e.name === 'AbortError') return true;
  return false;
}

function isOpenPredictionPosition(
  position: PositionWithUnrealizedPnL
): boolean {
  return position.resolved === false && position.status === 'active';
}

export function buildTeamTradingSummary({
  ownerId,
  ownerName,
  ownerBalance,
  positions,
  agents,
}: {
  ownerId: string;
  ownerName: string;
  ownerBalance: {
    balance: string | number;
    lifetimePnL: string | number;
  };
  positions: PositionsApiResponse;
  agents: Array<{
    id: string;
    username?: string | null;
    name?: string | null;
    virtualBalance?: number;
    lifetimePnL?: string | number;
  }>;
}): TeamTradingSummary {
  const byMember = new Map<
    string,
    { unrealizedPnL: number; openPositions: number }
  >();

  const addPosition = (memberId: string, unrealized: number) => {
    const cur = byMember.get(memberId) ?? {
      unrealizedPnL: 0,
      openPositions: 0,
    };
    byMember.set(memberId, {
      unrealizedPnL: cur.unrealizedPnL + unrealized,
      openPositions: cur.openPositions + 1,
    });
  };

  const perpPositions = positions.perpetuals?.positions ?? [];
  for (const p of perpPositions) {
    const memberId = p.isAgentPosition ? (p.agentId ?? ownerId) : ownerId;
    addPosition(memberId, toNumber(p.unrealizedPnL));
  }

  const predictionPositions = positions.predictions?.positions ?? [];
  for (const p of predictionPositions) {
    if (!isOpenPredictionPosition(p)) continue;
    const memberId = p.isAgentPosition ? (p.agentId ?? ownerId) : ownerId;
    addPosition(memberId, toNumber(p.unrealizedPnL));
  }

  const ownerWallet = toNumber(ownerBalance.balance);
  const ownerLifetime = toNumber(ownerBalance.lifetimePnL);
  const ownerUnrealized = byMember.get(ownerId)?.unrealizedPnL ?? 0;
  const ownerOpenPositions = byMember.get(ownerId)?.openPositions ?? 0;

  const ownerRow: TeamMemberTradingSummary = {
    entityType: 'owner',
    id: ownerId,
    name: ownerName,
    username: null,
    walletBalance: ownerWallet,
    lifetimePnL: ownerLifetime,
    unrealizedPnL: ownerUnrealized,
    currentPnL: ownerLifetime + ownerUnrealized,
    openPositions: ownerOpenPositions,
  };

  const agentRows: TeamMemberTradingSummary[] = agents.map((a) => {
    const id = a.id;
    const unrealized = byMember.get(id)?.unrealizedPnL ?? 0;
    const openPositions = byMember.get(id)?.openPositions ?? 0;
    const walletBalance = toNumber(a.virtualBalance);
    const lifetimePnL = toNumber(a.lifetimePnL);
    const name = a.name ?? 'Agent';

    return {
      entityType: 'agent',
      id,
      name,
      username: a.username ?? null,
      walletBalance,
      lifetimePnL,
      unrealizedPnL: unrealized,
      currentPnL: lifetimePnL + unrealized,
      openPositions,
    };
  });

  const members = [ownerRow, ...agentRows];
  const totals = sumMemberTotals(members);
  const agentsOnlyTotals = sumMemberTotals(agentRows);

  return {
    ownerId,
    ownerName,
    members,
    totals,
    agentsOnlyTotals,
    updatedAt: positions.timestamp ?? null,
  };
}

export function useTeamTradingSummary({
  ownerId,
  ownerName,
  enabled,
  getAccessToken,
}: {
  ownerId: string | null | undefined;
  ownerName: string;
  enabled: boolean;
  getAccessToken: () => Promise<string | null>;
}): {
  summary: TeamTradingSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerBalance, setOwnerBalance] =
    useState<UserBalanceApiResponse | null>(null);
  const [agents, setAgents] = useState<AgentsApiAgent[] | null>(null);
  const [positions, setPositions] = useState<PositionsApiResponse | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNonce is an intentional trigger to force re-fetch
  useEffect(() => {
    if (!enabled || !ownerId) return;

    let cancelled = false;
    const abort = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        // Owner balance is public.
        const [balanceRes, positionsRes, token] = await Promise.all([
          fetch(`/api/users/${encodeURIComponent(ownerId)}/balance`, {
            signal: abort.signal,
          }),
          fetch(
            `/api/markets/positions/${encodeURIComponent(ownerId)}?type=all&status=open`,
            {
              signal: abort.signal,
            }
          ),
          getAccessToken(),
        ]);

        if (!token) {
          throw new Error('Authentication required to load agents');
        }

        // Agents list requires auth.
        const agentsPromise = fetch('/api/agents', {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });

        if (!balanceRes.ok) {
          throw new Error(
            `Failed to fetch owner balance (${balanceRes.status})`
          );
        }
        if (!positionsRes.ok) {
          throw new Error(`Failed to fetch positions (${positionsRes.status})`);
        }

        const balanceJson = (await balanceRes.json()) as UserBalanceApiResponse;
        const positionsJson =
          (await positionsRes.json()) as PositionsApiResponse;

        const agentsRes = await agentsPromise;
        if (!agentsRes.ok) {
          throw new Error(`Failed to fetch agents (${agentsRes.status})`);
        }
        const agentsJson = (await agentsRes.json()) as AgentsApiResponse;
        if (!agentsJson.success) {
          throw new Error('Failed to fetch agents');
        }

        if (cancelled) return;

        setOwnerBalance(balanceJson);
        setPositions(positionsJson);
        setAgents(agentsJson.agents ?? []);
      } catch (e) {
        if (cancelled || isAbortError(e)) return;
        const message =
          e instanceof SyntaxError
            ? 'Invalid response from server. Please try again.'
            : e instanceof Error
              ? e.message
              : 'Failed to load team summary';
        setError(message);
        logger.error(
          'Failed to fetch team trading summary',
          { error: e instanceof Error ? e.message : String(e), ownerId },
          'useTeamTradingSummary'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [enabled, ownerId, getAccessToken, refreshNonce]);

  const summary = useMemo<TeamTradingSummary | null>(() => {
    if (!ownerId) return null;
    if (!ownerBalance || !positions || !agents) return null;
    return buildTeamTradingSummary({
      ownerId,
      ownerName,
      ownerBalance,
      positions,
      agents,
    });
  }, [ownerId, ownerName, ownerBalance, positions, agents]);

  return { summary, loading, error, refresh };
}
