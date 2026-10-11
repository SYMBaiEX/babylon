import { describe, expect, it } from 'bun:test';
import { buildTeamTradingSummary } from '@/lib/agents/team-trading-summary';
import type {
  UserPerpPositionSnapshot,
  UserPredictionPositionSnapshot,
} from '@/lib/markets/user-positions-types';

const PREDICTION_POSITION: UserPredictionPositionSnapshot = {
  id: 'prediction-1',
  marketId: 'market-1',
  question: 'Will the market resolve yes?',
  side: 'YES',
  shares: 10,
  avgPrice: 0.5,
  currentPrice: 0.5,
  currentProbability: 0.5,
  currentValue: 5,
  costBasis: 5,
  unrealizedPnL: 0,
  resolved: false,
  resolution: null,
  closesAt: null,
  status: '',
  createdAt: null,
  outcome: null,
  pnl: null,
  resolvedAt: null,
  isAgentPosition: false,
  agentId: null,
  agentName: null,
};
const PERP_POSITION: UserPerpPositionSnapshot = {
  id: 'perp-1',
  ticker: 'BTC',
  side: 'long',
  entryPrice: 100,
  currentPrice: 100,
  size: 100,
  leverage: 1,
  unrealizedPnL: 0,
  unrealizedPnLPercent: 0,
  liquidationPrice: 0,
  fundingPaid: 0,
  realizedPnL: 0,
  openedAt: '2026-02-28T00:00:00.000Z',
  closedAt: null,
  isAgentPosition: false,
  agentId: null,
  agentName: null,
};
const EMPTY_PERPETUALS = {
  stats: { totalPositions: 0, totalPnL: 0, totalFunding: 0 },
  total: 0,
  hasMore: false,
};
const EMPTY_PREDICTIONS = {
  stats: { totalPositions: 0 },
  total: 0,
  hasMore: false,
};

const BASE_INPUT = {
  ownerId: 'owner-1',
  ownerName: 'Owner',
  ownerBalance: { balance: '1000', lifetimePnL: '0' },
  agents: [
    {
      id: 'agent-1',
      name: 'agent',
      username: 'agent',
      virtualBalance: 500,
      lifetimePnL: 0,
    },
  ],
};

describe('buildTeamTradingSummary', () => {
  it('excludes closed prediction positions (resolved: true) from unrealized PnL and open count', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      ownerBalance: { balance: '1000', lifetimePnL: '0' },
      agents: [
        {
          id: 'agent-1',
          name: 'mnd',
          username: 'mnd',
          virtualBalance: 500,
          lifetimePnL: '-105.10',
        },
      ],
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: { ...EMPTY_PERPETUALS, positions: [] },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 539.39,
              resolved: true,
              status: 'resolved',
            },
          ],
        },
      },
    });

    const agentRow = summary.members.find((m) => m.id === 'agent-1');
    expect(agentRow).toBeDefined();
    expect(agentRow?.unrealizedPnL).toBe(0);
    expect(agentRow?.openPositions).toBe(0);
    expect(agentRow?.currentPnL).toBe(-105.1);

    expect(summary.totals.unrealizedPnL).toBe(0);
    expect(summary.totals.openPositions).toBe(0);
  });

  it('includes active prediction positions in unrealized PnL and open count', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      ownerBalance: { balance: '1000', lifetimePnL: '10' },
      agents: [
        {
          id: 'agent-1',
          name: 'agent',
          username: 'agent',
          virtualBalance: 500,
          lifetimePnL: 20,
        },
      ],
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: { ...EMPTY_PERPETUALS, positions: [] },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 50,
              resolved: false,
              status: 'active',
            },
          ],
        },
      },
    });

    const agentRow = summary.members.find((m) => m.id === 'agent-1');
    expect(agentRow).toBeDefined();
    expect(agentRow?.unrealizedPnL).toBe(50);
    expect(agentRow?.openPositions).toBe(1);
    expect(agentRow?.currentPnL).toBe(70);

    expect(summary.totals.unrealizedPnL).toBe(50);
    expect(summary.totals.openPositions).toBe(1);
  });

  it('excludes prediction positions with non-active status even when resolved is false', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: { ...EMPTY_PERPETUALS, positions: [] },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 100,
              resolved: false,
              status: 'closed',
            },
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 75,
              resolved: false,
              status: 'settled',
            },
          ],
        },
      },
    });

    const agentRow = summary.members.find((m) => m.id === 'agent-1');
    expect(agentRow?.unrealizedPnL).toBe(0);
    expect(agentRow?.openPositions).toBe(0);
    expect(summary.totals.unrealizedPnL).toBe(0);
    expect(summary.totals.openPositions).toBe(0);
  });

  it('excludes prediction positions with an empty status (conservative default)', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: { ...EMPTY_PERPETUALS, positions: [] },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 200,
              resolved: false,
            },
          ],
        },
      },
    });

    const agentRow = summary.members.find((m) => m.id === 'agent-1');
    expect(agentRow?.unrealizedPnL).toBe(0);
    expect(agentRow?.openPositions).toBe(0);
    expect(summary.totals.unrealizedPnL).toBe(0);
    expect(summary.totals.openPositions).toBe(0);
  });

  it('accrues active prediction positions that belong to the owner (isAgentPosition: false)', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: { ...EMPTY_PERPETUALS, positions: [] },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: false,
              unrealizedPnL: 30,
              resolved: false,
              status: 'active',
            },
          ],
        },
      },
    });

    const ownerRow = summary.members.find((m) => m.id === 'owner-1');
    expect(ownerRow?.unrealizedPnL).toBe(30);
    expect(ownerRow?.openPositions).toBe(1);
    expect(summary.totals.unrealizedPnL).toBe(30);
    expect(summary.totals.openPositions).toBe(1);
  });

  it('accumulates perpetual and prediction positions together for the same member', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: {
          ...EMPTY_PERPETUALS,
          positions: [
            {
              ...PERP_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 40,
            },
          ],
        },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 60,
              resolved: false,
              status: 'active',
            },
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 999,
              resolved: true,
              status: 'resolved',
            },
          ],
        },
      },
    });

    const agentRow = summary.members.find((m) => m.id === 'agent-1');
    expect(agentRow?.unrealizedPnL).toBe(100);
    expect(agentRow?.openPositions).toBe(2);
    expect(summary.totals.unrealizedPnL).toBe(100);
    expect(summary.totals.openPositions).toBe(2);
  });

  it('keeps agentsOnlyTotals separate from owner totals', () => {
    const summary = buildTeamTradingSummary({
      ...BASE_INPUT,
      ownerBalance: { balance: '1000', lifetimePnL: '5' },
      agents: [
        {
          id: 'agent-1',
          name: 'agent',
          username: 'agent',
          virtualBalance: 200,
          lifetimePnL: 10,
        },
      ],
      positions: {
        timestamp: '2026-02-28T00:00:00.000Z',
        perpetuals: { ...EMPTY_PERPETUALS, positions: [] },
        predictions: {
          ...EMPTY_PREDICTIONS,
          positions: [
            {
              ...PREDICTION_POSITION,
              isAgentPosition: false,
              unrealizedPnL: 15,
              resolved: false,
              status: 'active',
            },
            {
              ...PREDICTION_POSITION,
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 25,
              resolved: false,
              status: 'active',
            },
          ],
        },
      },
    });

    expect(summary.totals.unrealizedPnL).toBe(40);
    expect(summary.totals.openPositions).toBe(2);

    expect(summary.agentsOnlyTotals.unrealizedPnL).toBe(25);
    expect(summary.agentsOnlyTotals.openPositions).toBe(1);
  });
});
