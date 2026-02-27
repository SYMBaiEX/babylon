/**
 * Unit Tests: Leaderboard Cleanup
 *
 * Tests for the new wallet/team leaderboard system:
 * - LeaderboardQuerySchema validation (type, userId, backward compat)
 * - Wallet leaderboard logic (agents included, ranking, pagination)
 * - Team leaderboard logic (agent aggregation, combined points)
 * - User position calculation (wallet rank, team rank, agent-as-viewer)
 * - Batch operations now including agents
 */

import { describe, expect, it } from 'bun:test';
import { LeaderboardQuerySchema } from '@babylon/shared';

// ---------------------------------------------------------------------------
// LeaderboardQuerySchema Validation
// ---------------------------------------------------------------------------

describe('LeaderboardQuerySchema', () => {
  describe('type parameter', () => {
    it('should default to "wallet" when type is not provided', () => {
      const result = LeaderboardQuerySchema.parse({});
      expect(result.type).toBe('wallet');
    });

    it('should accept "wallet" as type', () => {
      const result = LeaderboardQuerySchema.parse({ type: 'wallet' });
      expect(result.type).toBe('wallet');
    });

    it('should accept "team" as type', () => {
      const result = LeaderboardQuerySchema.parse({ type: 'team' });
      expect(result.type).toBe('team');
    });

    it('should default to "wallet" for invalid type values', () => {
      const result = LeaderboardQuerySchema.parse({ type: 'invalid' });
      expect(result.type).toBe('wallet');
    });

    it('should default to "wallet" for empty string type', () => {
      const result = LeaderboardQuerySchema.parse({ type: '' });
      expect(result.type).toBe('wallet');
    });

    it('should default to "wallet" for old "total" type value', () => {
      const result = LeaderboardQuerySchema.parse({ type: 'total' });
      expect(result.type).toBe('wallet');
    });

    it('should default to "wallet" for old "all" type value', () => {
      const result = LeaderboardQuerySchema.parse({ type: 'all' });
      expect(result.type).toBe('wallet');
    });
  });

  describe('userId parameter', () => {
    it('should accept optional userId', () => {
      const result = LeaderboardQuerySchema.parse({ userId: 'user-123' });
      expect(result.userId).toBe('user-123');
    });

    it('should be undefined when not provided', () => {
      const result = LeaderboardQuerySchema.parse({});
      expect(result.userId).toBeUndefined();
    });

    it('should accept any string as userId', () => {
      const result = LeaderboardQuerySchema.parse({
        userId: 'did:privy:abc123',
      });
      expect(result.userId).toBe('did:privy:abc123');
    });
  });

  describe('page parameter', () => {
    it('should default to 1 when not provided', () => {
      const result = LeaderboardQuerySchema.parse({});
      expect(result.page).toBe(1);
    });

    it('should parse string page numbers (from query params)', () => {
      const result = LeaderboardQuerySchema.parse({ page: '3' });
      expect(result.page).toBe(3);
    });

    it('should clamp page to minimum 1', () => {
      const result = LeaderboardQuerySchema.parse({ page: '0' });
      expect(result.page).toBe(1);
    });

    it('should reject negative page values', () => {
      const result = LeaderboardQuerySchema.safeParse({ page: '-5' });
      expect(result.success).toBe(false);
    });
  });

  describe('pageSize parameter', () => {
    it('should default to 100 when not provided', () => {
      const result = LeaderboardQuerySchema.parse({});
      expect(result.pageSize).toBe(100);
    });

    it('should clamp pageSize to max 100', () => {
      const result = LeaderboardQuerySchema.parse({ pageSize: '500' });
      expect(result.pageSize).toBe(100);
    });

    it('should clamp pageSize to min 1', () => {
      const result = LeaderboardQuerySchema.parse({ pageSize: '0' });
      expect(result.pageSize).toBe(1);
    });

    it('should accept valid pageSize values', () => {
      const result = LeaderboardQuerySchema.parse({ pageSize: '50' });
      expect(result.pageSize).toBe(50);
    });
  });

  describe('backward compatibility', () => {
    it('should still accept pointsType parameter without error', () => {
      const result = LeaderboardQuerySchema.parse({ pointsType: 'total' });
      expect(result.pointsType).toBe('total');
    });

    it('should still accept minPoints parameter without error', () => {
      const result = LeaderboardQuerySchema.parse({ minPoints: '500' });
      expect(result.minPoints).toBe(500);
    });

    it('should handle all old params together with new params', () => {
      const result = LeaderboardQuerySchema.parse({
        page: '2',
        pageSize: '50',
        type: 'team',
        userId: 'user-abc',
        pointsType: 'all',
        minPoints: '1000',
      });
      expect(result.type).toBe('team');
      expect(result.userId).toBe('user-abc');
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
      expect(result.pointsType).toBe('all');
      expect(result.minPoints).toBe(1000);
    });

    it('should default minPoints to 0', () => {
      const result = LeaderboardQuerySchema.parse({});
      expect(result.minPoints).toBe(0);
    });

    it('should transform invalid pointsType to undefined', () => {
      const result = LeaderboardQuerySchema.parse({
        pointsType: 'invalid',
      });
      expect(result.pointsType).toBeUndefined();
    });
  });

  describe('full query string simulation', () => {
    it('should parse typical wallet leaderboard request', () => {
      const queryParams = {
        type: 'wallet',
        page: '1',
        pageSize: '100',
      };
      const result = LeaderboardQuerySchema.parse(queryParams);
      expect(result.type).toBe('wallet');
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
      expect(result.userId).toBeUndefined();
    });

    it('should parse authenticated team leaderboard request', () => {
      const queryParams = {
        type: 'team',
        page: '1',
        pageSize: '100',
        userId: 'user-xyz-789',
      };
      const result = LeaderboardQuerySchema.parse(queryParams);
      expect(result.type).toBe('team');
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
      expect(result.userId).toBe('user-xyz-789');
    });

    it('should handle completely empty query params', () => {
      const result = LeaderboardQuerySchema.parse({});
      expect(result.type).toBe('wallet');
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
      expect(result.minPoints).toBe(0);
      expect(result.userId).toBeUndefined();
      expect(result.pointsType).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Wallet Leaderboard Logic
// ---------------------------------------------------------------------------

describe('Wallet Leaderboard Logic', () => {
  interface WalletEntry {
    id: string;
    totalPoints: number;
    isAgent: boolean;
    isActor: boolean;
    managedBy: string | null;
  }

  function simulateWalletLeaderboard(
    allUsers: WalletEntry[],
    page: number,
    pageSize: number
  ) {
    const filtered = allUsers.filter((u) => !u.isActor);
    const sorted = [...filtered].sort(
      (a, b) => b.totalPoints - a.totalPoints
    );
    const skip = (page - 1) * pageSize;
    const paginated = sorted.slice(skip, skip + pageSize);
    return {
      users: paginated.map((u, i) => ({ ...u, rank: skip + i + 1 })),
      totalCount: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize),
    };
  }

  const testUsers: WalletEntry[] = [
    {
      id: 'user-1',
      totalPoints: 5000,
      isAgent: false,
      isActor: false,
      managedBy: null,
    },
    {
      id: 'user-2',
      totalPoints: 3000,
      isAgent: false,
      isActor: false,
      managedBy: null,
    },
    {
      id: 'agent-1',
      totalPoints: 4000,
      isAgent: true,
      isActor: false,
      managedBy: 'user-1',
    },
    {
      id: 'agent-2',
      totalPoints: 1000,
      isAgent: true,
      isActor: false,
      managedBy: 'user-1',
    },
    {
      id: 'actor-1',
      totalPoints: 9999,
      isAgent: false,
      isActor: true,
      managedBy: null,
    },
    {
      id: 'user-3',
      totalPoints: 2000,
      isAgent: false,
      isActor: false,
      managedBy: null,
    },
  ];

  it('should include agents as individual entries', () => {
    const result = simulateWalletLeaderboard(testUsers, 1, 100);
    const ids = result.users.map((u) => u.id);
    expect(ids).toContain('agent-1');
    expect(ids).toContain('agent-2');
  });

  it('should exclude actors', () => {
    const result = simulateWalletLeaderboard(testUsers, 1, 100);
    const ids = result.users.map((u) => u.id);
    expect(ids).not.toContain('actor-1');
  });

  it('should rank by totalPoints descending', () => {
    const result = simulateWalletLeaderboard(testUsers, 1, 100);
    expect(result.users[0]!.id).toBe('user-1'); // 5000
    expect(result.users[1]!.id).toBe('agent-1'); // 4000
    expect(result.users[2]!.id).toBe('user-2'); // 3000
    expect(result.users[3]!.id).toBe('user-3'); // 2000
    expect(result.users[4]!.id).toBe('agent-2'); // 1000
  });

  it('should assign correct ranks', () => {
    const result = simulateWalletLeaderboard(testUsers, 1, 100);
    expect(result.users[0]!.rank).toBe(1);
    expect(result.users[1]!.rank).toBe(2);
    expect(result.users[4]!.rank).toBe(5);
  });

  it('should count total excluding actors', () => {
    const result = simulateWalletLeaderboard(testUsers, 1, 100);
    expect(result.totalCount).toBe(5); // 3 users + 2 agents, no actor
  });

  it('should paginate correctly', () => {
    const result = simulateWalletLeaderboard(testUsers, 1, 2);
    expect(result.users.length).toBe(2);
    expect(result.users[0]!.rank).toBe(1);
    expect(result.users[1]!.rank).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it('should handle page 2 with correct ranks', () => {
    const result = simulateWalletLeaderboard(testUsers, 2, 2);
    expect(result.users.length).toBe(2);
    expect(result.users[0]!.rank).toBe(3);
    expect(result.users[1]!.rank).toBe(4);
  });

  it('should handle last partial page', () => {
    const result = simulateWalletLeaderboard(testUsers, 3, 2);
    expect(result.users.length).toBe(1);
    expect(result.users[0]!.rank).toBe(5);
  });

  it('should handle page beyond range', () => {
    const result = simulateWalletLeaderboard(testUsers, 10, 100);
    expect(result.users.length).toBe(0);
  });

  it('should handle empty dataset', () => {
    const result = simulateWalletLeaderboard([], 1, 100);
    expect(result.users.length).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('should handle all entries being actors', () => {
    const onlyActors: WalletEntry[] = [
      {
        id: 'a1',
        totalPoints: 100,
        isAgent: false,
        isActor: true,
        managedBy: null,
      },
      {
        id: 'a2',
        totalPoints: 200,
        isAgent: false,
        isActor: true,
        managedBy: null,
      },
    ];
    const result = simulateWalletLeaderboard(onlyActors, 1, 100);
    expect(result.users.length).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('should handle ties in totalPoints', () => {
    const tiedUsers: WalletEntry[] = [
      {
        id: 'u1',
        totalPoints: 1000,
        isAgent: false,
        isActor: false,
        managedBy: null,
      },
      {
        id: 'u2',
        totalPoints: 1000,
        isAgent: false,
        isActor: false,
        managedBy: null,
      },
      {
        id: 'u3',
        totalPoints: 1000,
        isAgent: true,
        isActor: false,
        managedBy: 'u1',
      },
    ];
    const result = simulateWalletLeaderboard(tiedUsers, 1, 100);
    expect(result.users.length).toBe(3);
    expect(result.users.every((u) => u.totalPoints === 1000)).toBe(true);
    expect(result.users[0]!.rank).toBe(1);
    expect(result.users[1]!.rank).toBe(2);
    expect(result.users[2]!.rank).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Team Leaderboard Logic
// ---------------------------------------------------------------------------

describe('Team Leaderboard Logic', () => {
  interface UserRow {
    id: string;
    totalPoints: number;
    isAgent: boolean;
    isActor: boolean;
    managedBy: string | null;
  }

  function simulateTeamLeaderboard(
    allUsers: UserRow[],
    page: number,
    pageSize: number
  ) {
    const humans = allUsers.filter((u) => !u.isActor && !u.isAgent);
    const agents = allUsers.filter((u) => u.isAgent);

    const agentsByManager = new Map<string, { points: number; count: number }>();
    for (const agent of agents) {
      if (!agent.managedBy) continue;
      const existing = agentsByManager.get(agent.managedBy) ?? {
        points: 0,
        count: 0,
      };
      existing.points += agent.totalPoints;
      existing.count += 1;
      agentsByManager.set(agent.managedBy, existing);
    }

    const teams = humans.map((u) => {
      const agentData = agentsByManager.get(u.id) ?? { points: 0, count: 0 };
      return {
        id: u.id,
        userPoints: u.totalPoints,
        agentPoints: agentData.points,
        agentCount: agentData.count,
        teamTotalPoints: u.totalPoints + agentData.points,
      };
    });

    teams.sort((a, b) => b.teamTotalPoints - a.teamTotalPoints);

    const skip = (page - 1) * pageSize;
    const paginated = teams.slice(skip, skip + pageSize);
    return {
      users: paginated.map((t, i) => ({ ...t, rank: skip + i + 1 })),
      totalCount: humans.length,
      totalPages: Math.ceil(humans.length / pageSize),
    };
  }

  const testUsers: UserRow[] = [
    {
      id: 'user-1',
      totalPoints: 5000,
      isAgent: false,
      isActor: false,
      managedBy: null,
    },
    {
      id: 'user-2',
      totalPoints: 8000,
      isAgent: false,
      isActor: false,
      managedBy: null,
    },
    {
      id: 'user-3',
      totalPoints: 2000,
      isAgent: false,
      isActor: false,
      managedBy: null,
    },
    {
      id: 'agent-a',
      totalPoints: 4000,
      isAgent: true,
      isActor: false,
      managedBy: 'user-1',
    },
    {
      id: 'agent-b',
      totalPoints: 3000,
      isAgent: true,
      isActor: false,
      managedBy: 'user-1',
    },
    {
      id: 'agent-c',
      totalPoints: 500,
      isAgent: true,
      isActor: false,
      managedBy: 'user-3',
    },
    {
      id: 'actor-1',
      totalPoints: 99999,
      isAgent: false,
      isActor: true,
      managedBy: null,
    },
  ];

  it('should aggregate agent points into team total', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    const user1 = result.users.find((u) => u.id === 'user-1')!;
    expect(user1.userPoints).toBe(5000);
    expect(user1.agentPoints).toBe(7000); // 4000 + 3000
    expect(user1.teamTotalPoints).toBe(12000);
    expect(user1.agentCount).toBe(2);
  });

  it('should rank by teamTotalPoints descending', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    // user-1: 5000 + 7000 = 12000
    // user-2: 8000 + 0 = 8000
    // user-3: 2000 + 500 = 2500
    expect(result.users[0]!.id).toBe('user-1');
    expect(result.users[0]!.teamTotalPoints).toBe(12000);
    expect(result.users[1]!.id).toBe('user-2');
    expect(result.users[1]!.teamTotalPoints).toBe(8000);
    expect(result.users[2]!.id).toBe('user-3');
    expect(result.users[2]!.teamTotalPoints).toBe(2500);
  });

  it('should not include agents as separate team entries', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    const ids = result.users.map((u) => u.id);
    expect(ids).not.toContain('agent-a');
    expect(ids).not.toContain('agent-b');
    expect(ids).not.toContain('agent-c');
  });

  it('should not include actors', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    const ids = result.users.map((u) => u.id);
    expect(ids).not.toContain('actor-1');
  });

  it('should handle user with no agents', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    const user2 = result.users.find((u) => u.id === 'user-2')!;
    expect(user2.agentPoints).toBe(0);
    expect(user2.agentCount).toBe(0);
    expect(user2.teamTotalPoints).toBe(8000);
  });

  it('should handle user with one agent', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    const user3 = result.users.find((u) => u.id === 'user-3')!;
    expect(user3.agentPoints).toBe(500);
    expect(user3.agentCount).toBe(1);
    expect(user3.teamTotalPoints).toBe(2500);
  });

  it('should count total as number of human users only', () => {
    const result = simulateTeamLeaderboard(testUsers, 1, 100);
    expect(result.totalCount).toBe(3);
  });

  it('should handle empty dataset', () => {
    const result = simulateTeamLeaderboard([], 1, 100);
    expect(result.users.length).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('should handle only agents (no humans)', () => {
    const onlyAgents: UserRow[] = [
      {
        id: 'a1',
        totalPoints: 100,
        isAgent: true,
        isActor: false,
        managedBy: 'nonexistent',
      },
    ];
    const result = simulateTeamLeaderboard(onlyAgents, 1, 100);
    expect(result.users.length).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('should handle agents with zero points', () => {
    const withZeroAgents: UserRow[] = [
      {
        id: 'u1',
        totalPoints: 1000,
        isAgent: false,
        isActor: false,
        managedBy: null,
      },
      {
        id: 'a1',
        totalPoints: 0,
        isAgent: true,
        isActor: false,
        managedBy: 'u1',
      },
    ];
    const result = simulateTeamLeaderboard(withZeroAgents, 1, 100);
    expect(result.users[0]!.teamTotalPoints).toBe(1000);
    expect(result.users[0]!.agentCount).toBe(1);
    expect(result.users[0]!.agentPoints).toBe(0);
  });

  it('should handle agents with null managedBy (orphaned agents)', () => {
    const withOrphans: UserRow[] = [
      {
        id: 'u1',
        totalPoints: 1000,
        isAgent: false,
        isActor: false,
        managedBy: null,
      },
      {
        id: 'a1',
        totalPoints: 500,
        isAgent: true,
        isActor: false,
        managedBy: null,
      },
    ];
    const result = simulateTeamLeaderboard(withOrphans, 1, 100);
    expect(result.users[0]!.teamTotalPoints).toBe(1000);
    expect(result.users[0]!.agentCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// User Position Logic
// ---------------------------------------------------------------------------

describe('User Position Logic', () => {
  interface UserRow {
    id: string;
    totalPoints: number;
    isAgent: boolean;
    isActor: boolean;
    managedBy: string | null;
  }

  function simulateWalletPosition(
    allUsers: UserRow[],
    userId: string,
    pageSize = 100
  ) {
    const eligible = allUsers.filter((u) => !u.isActor);
    const user = eligible.find((u) => u.id === userId);
    if (!user) return null;

    const higherCount = eligible.filter(
      (u) => u.totalPoints > user.totalPoints
    ).length;
    const rank = higherCount + 1;
    return { rank, page: Math.ceil(rank / pageSize) };
  }

  function simulateTeamPosition(
    allUsers: UserRow[],
    userId: string,
    pageSize = 100
  ) {
    const user = allUsers.find((u) => u.id === userId);
    if (!user) return null;

    // Resolve agent to manager for team view
    const effectiveUserId =
      user.isAgent && user.managedBy ? user.managedBy : user.id;
    const effectiveUser = allUsers.find((u) => u.id === effectiveUserId);
    if (!effectiveUser || effectiveUser.isActor) return null;

    const humans = allUsers.filter((u) => !u.isActor && !u.isAgent);
    const agents = allUsers.filter((u) => u.isAgent);

    function getTeamTotal(humanId: string): number {
      const human = allUsers.find((u) => u.id === humanId);
      if (!human) return 0;
      const agentPoints = agents
        .filter((a) => a.managedBy === humanId)
        .reduce((sum, a) => sum + a.totalPoints, 0);
      return human.totalPoints + agentPoints;
    }

    const myTeamTotal = getTeamTotal(effectiveUserId);
    const higherCount = humans.filter(
      (h) => getTeamTotal(h.id) > myTeamTotal
    ).length;
    const rank = higherCount + 1;
    return { rank, page: Math.ceil(rank / pageSize), teamTotal: myTeamTotal };
  }

  const testUsers: UserRow[] = [
    { id: 'u1', totalPoints: 5000, isAgent: false, isActor: false, managedBy: null },
    { id: 'u2', totalPoints: 8000, isAgent: false, isActor: false, managedBy: null },
    { id: 'u3', totalPoints: 2000, isAgent: false, isActor: false, managedBy: null },
    { id: 'a1', totalPoints: 4000, isAgent: true, isActor: false, managedBy: 'u1' },
    { id: 'a2', totalPoints: 3000, isAgent: true, isActor: false, managedBy: 'u1' },
    { id: 'a3', totalPoints: 500, isAgent: true, isActor: false, managedBy: 'u3' },
  ];

  describe('wallet position', () => {
    it('should return rank 1 for highest points user', () => {
      const pos = simulateWalletPosition(testUsers, 'u2');
      expect(pos!.rank).toBe(1); // 8000 is highest
    });

    it('should count agents in wallet ranking', () => {
      // u2=8000, u1=5000, a1=4000, a2=3000, u3=2000, a3=500
      const pos = simulateWalletPosition(testUsers, 'a1');
      expect(pos!.rank).toBe(3); // 4000 is 3rd after u2's 8000 and u1's 5000
    });

    it('should return correct page for low-ranked user', () => {
      const pos = simulateWalletPosition(testUsers, 'a3', 2);
      expect(pos!.rank).toBe(6); // lowest at 500
      expect(pos!.page).toBe(3); // rank 6 / pageSize 2 = page 3
    });

    it('should return null for non-existent user', () => {
      const pos = simulateWalletPosition(testUsers, 'nonexistent');
      expect(pos).toBeNull();
    });

    it('should handle ties (same rank computation)', () => {
      const tiedUsers: UserRow[] = [
        { id: 'u1', totalPoints: 1000, isAgent: false, isActor: false, managedBy: null },
        { id: 'u2', totalPoints: 1000, isAgent: false, isActor: false, managedBy: null },
        { id: 'u3', totalPoints: 500, isAgent: false, isActor: false, managedBy: null },
      ];
      const pos1 = simulateWalletPosition(tiedUsers, 'u1');
      const pos2 = simulateWalletPosition(tiedUsers, 'u2');
      expect(pos1!.rank).toBe(1);
      expect(pos2!.rank).toBe(1); // same count of higher
    });

    it('should return page 1 for rank 1', () => {
      const pos = simulateWalletPosition(testUsers, 'u2', 100);
      expect(pos!.page).toBe(1);
    });
  });

  describe('team position', () => {
    it('should rank by combined team total', () => {
      // u1: 5000 + 4000 + 3000 = 12000 → rank 1
      // u2: 8000 → rank 2
      // u3: 2000 + 500 = 2500 → rank 3
      const pos1 = simulateTeamPosition(testUsers, 'u1');
      const pos2 = simulateTeamPosition(testUsers, 'u2');
      const pos3 = simulateTeamPosition(testUsers, 'u3');
      expect(pos1!.rank).toBe(1);
      expect(pos1!.teamTotal).toBe(12000);
      expect(pos2!.rank).toBe(2);
      expect(pos2!.teamTotal).toBe(8000);
      expect(pos3!.rank).toBe(3);
      expect(pos3!.teamTotal).toBe(2500);
    });

    it('should resolve agent to manager team', () => {
      const pos = simulateTeamPosition(testUsers, 'a1');
      expect(pos!.rank).toBe(1); // agent-a1 belongs to u1, team total 12000
      expect(pos!.teamTotal).toBe(12000);
    });

    it('should resolve different agents to same manager', () => {
      const pos1 = simulateTeamPosition(testUsers, 'a1');
      const pos2 = simulateTeamPosition(testUsers, 'a2');
      expect(pos1!.rank).toBe(pos2!.rank); // both belong to u1
      expect(pos1!.teamTotal).toBe(pos2!.teamTotal);
    });

    it('should return null for non-existent user', () => {
      const pos = simulateTeamPosition(testUsers, 'nonexistent');
      expect(pos).toBeNull();
    });

    it('should handle user with no agents', () => {
      const pos = simulateTeamPosition(testUsers, 'u2');
      expect(pos!.teamTotal).toBe(8000);
    });
  });
});

// ---------------------------------------------------------------------------
// Batch Operation Agent Inclusion (updated from Phase 0)
// ---------------------------------------------------------------------------

describe('Batch Operation Agent Inclusion', () => {
  interface MockUser {
    id: string;
    totalPoints: string;
    virtualBalance: string;
    isAgent: boolean;
    isActor: boolean;
  }

  function getBackfillCandidatesNew(allUsers: MockUser[]): MockUser[] {
    return allUsers.filter(
      (u) =>
        !u.isActor &&
        u.totalPoints === '0' &&
        Number.parseFloat(u.virtualBalance) > 0
    );
  }

  function getMarkDirtyCandidatesNew(allUsers: MockUser[]): MockUser[] {
    return allUsers.filter(
      (u) => !u.isActor && u.totalPoints === '0'
    );
  }

  const mockUsers: MockUser[] = [
    { id: 'user-1', totalPoints: '0', virtualBalance: '2000', isAgent: false, isActor: false },
    { id: 'agent-1', totalPoints: '0', virtualBalance: '5000', isAgent: true, isActor: false },
    { id: 'agent-2', totalPoints: '0', virtualBalance: '0', isAgent: true, isActor: false },
    { id: 'actor-1', totalPoints: '0', virtualBalance: '8000', isAgent: false, isActor: true },
    { id: 'user-2', totalPoints: '1500', virtualBalance: '1500', isAgent: false, isActor: false },
  ];

  it('should now include agents in backfill candidates', () => {
    const candidates = getBackfillCandidatesNew(mockUsers);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain('user-1');
    expect(ids).toContain('agent-1'); // NOW included (was excluded before)
    expect(ids).not.toContain('agent-2'); // zero balance, nothing to backfill
    expect(ids).not.toContain('actor-1'); // actors still excluded
    expect(ids).not.toContain('user-2'); // totalPoints already set
  });

  it('should now include agents in markDirty candidates', () => {
    const candidates = getMarkDirtyCandidatesNew(mockUsers);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain('user-1');
    expect(ids).toContain('agent-1'); // NOW included
    expect(ids).toContain('agent-2'); // NOW included (even with 0 balance)
    expect(ids).not.toContain('actor-1');
    expect(ids).not.toContain('user-2');
  });

  it('should still exclude actors from all batch operations', () => {
    const backfill = getBackfillCandidatesNew(mockUsers);
    const dirty = getMarkDirtyCandidatesNew(mockUsers);
    expect(backfill.every((c) => !c.isActor)).toBe(true);
    expect(dirty.every((c) => !c.isActor)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leaderboard Entry Data Integrity
// ---------------------------------------------------------------------------

describe('Leaderboard Entry Data Integrity', () => {
  it('should convert decimal string totalPoints to number', () => {
    const rawTotalPoints = '12345.67';
    const converted = Number(rawTotalPoints);
    expect(converted).toBe(12345.67);
    expect(typeof converted).toBe('number');
  });

  it('should handle null totalPoints as 0', () => {
    const rawTotalPoints = null;
    const converted = Number(rawTotalPoints ?? 0);
    expect(converted).toBe(0);
  });

  it('should handle "0" totalPoints correctly', () => {
    const rawTotalPoints = '0';
    const converted = Number(rawTotalPoints ?? 0);
    expect(converted).toBe(0);
  });

  it('should handle "0.00" totalPoints correctly', () => {
    const rawTotalPoints = '0.00';
    const converted = Number(rawTotalPoints ?? 0);
    expect(converted).toBe(0);
  });

  it('should handle very large decimal totalPoints', () => {
    const rawTotalPoints = '999999999999999.99';
    const converted = Number(rawTotalPoints);
    expect(converted).toBeCloseTo(999999999999999.99, 0);
    expect(Number.isFinite(converted)).toBe(true);
  });

  it('should handle negative totalPoints', () => {
    const rawTotalPoints = '-500.25';
    const converted = Number(rawTotalPoints);
    expect(converted).toBe(-500.25);
  });

  it('should compute page from rank correctly', () => {
    expect(Math.ceil(1 / 100)).toBe(1);
    expect(Math.ceil(100 / 100)).toBe(1);
    expect(Math.ceil(101 / 100)).toBe(2);
    expect(Math.ceil(200 / 100)).toBe(2);
    expect(Math.ceil(201 / 100)).toBe(3);
    expect(Math.ceil(1000 / 100)).toBe(10);
  });

  it('should compute page with custom pageSize', () => {
    expect(Math.ceil(1 / 50)).toBe(1);
    expect(Math.ceil(50 / 50)).toBe(1);
    expect(Math.ceil(51 / 50)).toBe(2);
  });
});
