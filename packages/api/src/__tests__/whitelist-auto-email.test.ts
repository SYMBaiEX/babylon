import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockSendWhitelistWelcomeEmailsToUsers = mock(() => Promise.resolve());
const mockGetLeaderboard = mock();

const whitelistTable = {
  id: 'id',
  userId: 'userId',
  source: 'source',
  reason: 'reason',
  grantedBy: 'grantedBy',
  grantedAt: 'grantedAt',
  revokedAt: 'revokedAt',
};
const whitelistConfigTable = {
  id: 'id',
  leaderboardRankThreshold: 'leaderboardRankThreshold',
};
const nftSnapshotTable = { userId: 'userId' };
const usersTable = {
  id: 'id',
  reputationPoints: 'reputationPoints',
  isActor: 'isActor',
  isAgent: 'isAgent',
};

let mockWhitelistConfigRow: { leaderboardRankThreshold: number | null } | null = {
  leaderboardRankThreshold: 100,
};
let mockTopUsers: Array<{ id: string }> = [];
let mockSnapshotRows: Array<{ userId: string }> = [];
let mockExistingRows: Array<{ userId: string; revokedAt: Date | null }> = [];
let mockInsertedRows: Array<{ userId: string }> = [];

const mockDbSelect = mock(() => ({
  from: (table: unknown) => {
    if (table === whitelistConfigTable) {
      return {
        where: () => ({
          limit: () => Promise.resolve(mockWhitelistConfigRow ? [mockWhitelistConfigRow] : []),
        }),
      };
    }

    if (table === nftSnapshotTable) {
      return {
        where: () => Promise.resolve(mockSnapshotRows),
      };
    }

    if (table === whitelistTable) {
      return {
        where: () => Promise.resolve(mockExistingRows),
      };
    }

    if (table === usersTable) {
      return {
        where: () => ({ limit: () => Promise.resolve([]) }),
      };
    }

    return {
      where: () => Promise.resolve([]),
    };
  },
}));

const mockDbInsert = mock(() => ({
  values: () => ({
    onConflictDoNothing: () => ({
      returning: () => Promise.resolve(mockInsertedRows),
    }),
    onConflictDoUpdate: () => ({
      returning: () => Promise.resolve([]),
    }),
  }),
}));

mock.module('@babylon/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  and: (...args: unknown[]) => args,
  desc: (col: unknown) => col,
  eq: (a: unknown, b: unknown) => [a, b],
  inArray: (a: unknown, b: unknown) => [a, b],
  isNull: (a: unknown) => a,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  users: usersTable,
  whitelist: whitelistTable,
  whitelistConfig: whitelistConfigTable,
  nftSnapshot: nftSnapshotTable,
}));

mock.module('@babylon/engine', () => ({
  UserAlphaGroupAssignmentService: {
    assignDefaultGroups: mock(() => Promise.resolve()),
  },
}));

mock.module('@babylon/shared', () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module('nanoid', () => ({
  nanoid: mock(() => 'mock-id'),
}));

mock.module('../services/points-service', () => ({
  PointsService: {
    getLeaderboard: mockGetLeaderboard,
  },
}));

mock.module('../services/whitelist-email-service', () => ({
  sendWhitelistWelcomeEmailToUser: mock(() => Promise.resolve()),
  sendWhitelistWelcomeEmailsToUsers: mockSendWhitelistWelcomeEmailsToUsers,
}));

const { autoWhitelistCurrentTopN } = await import('../services/whitelist-service');

describe('autoWhitelistCurrentTopN → whitelist welcome emails', () => {
  beforeEach(() => {
    mockDbSelect.mockClear();
    mockDbInsert.mockClear();
    mockGetLeaderboard.mockClear();
    mockSendWhitelistWelcomeEmailsToUsers.mockClear();

    mockWhitelistConfigRow = { leaderboardRankThreshold: 100 };
    mockTopUsers = [{ id: 'user-1' }, { id: 'user-2' }];
    mockSnapshotRows = [];
    mockExistingRows = [];
    mockInsertedRows = [{ userId: 'user-1' }, { userId: 'user-2' }];

    mockGetLeaderboard.mockResolvedValue({ users: mockTopUsers });
  });

  it('sends whitelist welcome emails for users inserted by leaderboard cron', async () => {
    const result = await autoWhitelistCurrentTopN();

    expect(result.inserted).toBe(2);
    expect(mockSendWhitelistWelcomeEmailsToUsers).toHaveBeenCalledTimes(1);
    expect(mockSendWhitelistWelcomeEmailsToUsers).toHaveBeenCalledWith([
      'user-1',
      'user-2',
    ]);
  });

  it('does not send whitelist welcome emails when leaderboard is empty', async () => {
    mockTopUsers = [];
    mockGetLeaderboard.mockResolvedValue({ users: mockTopUsers });

    const result = await autoWhitelistCurrentTopN();

    expect(result.totalInTopN).toBe(0);
    expect(result.inserted).toBe(0);
    expect(mockSendWhitelistWelcomeEmailsToUsers).toHaveBeenCalledTimes(0);
  });
});
