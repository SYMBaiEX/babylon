import { describe, expect, it } from 'bun:test';
import { buildTeamTradingSummary } from '../useTeamTradingSummary';

describe('buildTeamTradingSummary', () => {
  it('excludes closed prediction positions from team unrealized PnL and open count', () => {
    const summary = buildTeamTradingSummary({
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerBalance: {
        balance: '1000',
        lifetimePnL: '0',
      },
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
        perpetuals: { positions: [] },
        predictions: {
          positions: [
            {
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 539.39,
              resolved: true,
              status: 'resolved',
            },
          ],
        },
        timestamp: '2026-02-28T00:00:00.000Z',
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

  it('includes active prediction positions in team unrealized PnL and open count', () => {
    const summary = buildTeamTradingSummary({
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerBalance: {
        balance: '1000',
        lifetimePnL: '10',
      },
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
        perpetuals: { positions: [] },
        predictions: {
          positions: [
            {
              isAgentPosition: true,
              agentId: 'agent-1',
              unrealizedPnL: 50,
              resolved: false,
              status: 'active',
            },
          ],
        },
        timestamp: '2026-02-28T00:00:00.000Z',
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
});
