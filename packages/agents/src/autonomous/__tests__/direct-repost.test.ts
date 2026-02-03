import { describe, expect, mock, test } from 'bun:test';

const mockPost = {
  id: 'post-1',
  authorId: 'user-1',
  content: 'original content',
  originalPostId: 'post-0',
};

const mockDb = {
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        limit: mock(async () => [mockPost]),
      })),
    })),
  })),
  transaction: mock(async () => {
    throw new Error('transaction should not run for repost-of-repost');
  }),
};

mock.module('@babylon/db', () => ({
  actorState: {},
  aliasedTable: mock(() => ({})),
  and: (...args: unknown[]) => args,
  asSystem: () => ({}),
  asUser: () => ({}),
  chatParticipants: {},
  chats: {},
  comments: {},
  db: mockDb,
  dmAcceptances: {},
  eq: (a: unknown, b: unknown) => ({ a, b }),
  gte: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  messages: {},
  perpPositions: {},
  posts: {
    id: 'id',
    authorId: 'authorId',
    content: 'content',
    originalPostId: 'originalPostId',
  },
  reactions: {},
  shares: { id: 'id', postId: 'postId', userId: 'userId' },
  sql: {},
  users: { id: 'id' },
}));

mock.module('@babylon/api', () => ({
  broadcastAgentActivity: mock(async () => undefined),
  broadcastChatMessage: mock(async () => undefined),
  broadcastToChannel: mock(async () => undefined),
}));

mock.module('@babylon/core/markets/perps', () => ({
  PerpDbAdapter: class {},
  PerpMarketService: class {},
}));

mock.module('@babylon/core/markets/prediction', () => ({
  PredictionDbAdapter: class {},
  PredictionMarketService: class {},
}));

mock.module('@babylon/engine', () => ({
  FEE_CONFIG: {
    TRADING_FEE_RATE: 0,
    PLATFORM_SHARE: 0,
    REFERRER_SHARE: 0,
    MIN_FEE_AMOUNT: 0,
    FEE_TYPES: {},
  },
  FeeService: { processTradingFee: mock(async () => ({ feeCharged: 0 })) },
  generateTagsFromPost: mock(async () => []),
  invalidateAfterPredictionTrade: mock(async () => undefined),
  PredictionPricing: {},
  StaticDataRegistry: { getActor: mock(() => null) },
  storeTagsForPost: mock(async () => undefined),
  WalletService: class {},
}));

mock.module('../../shared/logger', () => ({
  logger: {
    info: mock(() => undefined),
    warn: mock(() => undefined),
    debug: mock(() => undefined),
    error: mock(() => undefined),
  },
}));

mock.module('../../shared/snowflake', () => ({
  generateSnowflakeId: mock(async () => 'snowflake-id'),
}));

mock.module('../../services/AgentPnLService', () => ({
  agentPnLService: { recordTrade: mock(async () => undefined) },
}));

mock.module('../TopicDiversityService', () => ({
  topicDiversityService: { trackPostTopics: mock(async () => undefined) },
}));

mock.module('../utils/resolvePerpTicker', () => ({
  resolvePerpTicker: mock(() => null),
}));

const { executeDirectRepost } = await import('../DirectExecutors');

describe('executeDirectRepost', () => {
  test('rejects reposting a repost', async () => {
    const result = await executeDirectRepost({
      agentUserId: 'user-2',
      postId: 'post-1',
      comment: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot repost a repost');
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
