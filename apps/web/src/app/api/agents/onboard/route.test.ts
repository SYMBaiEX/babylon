/**
 * Tests for Agent On-Chain Registration API
 *
 * @route POST /api/agents/onboard - Register agent on-chain
 * @route GET /api/agents/onboard - Check registration status
 *
 * Validates three critical fixes:
 * - C1: DB update after Agent0 on-chain registration
 * - C2: walletAddress included in select clause
 * - C3: GET status check uses agent0TokenId (not legacy nftTokenId)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { NextRequest } from 'next/server';

// ─── Mock Setup ──────────────────────────────────────────────────────

const mockAuthenticate = mock();
const mockAsUser = mock();
const mockGetAgent0SDK = mock();
const mockSyncAfterAgent0Registration = mock();
const mockGenerateSnowflakeId = mock();

// Mock logger to avoid noise in test output
const mockLogger = {
  info: mock(),
  error: mock(),
  warn: mock(),
  debug: mock(),
};

// Mock AgentOnboardSchema
const mockParse = mock();
const mockAgentOnboardSchema = { parse: mockParse };

mock.module('@babylon/agents', () => ({
  getAgent0SDK: mockGetAgent0SDK,
  syncAfterAgent0Registration: mockSyncAfterAgent0Registration,
}));

mock.module('@babylon/api', () => ({
  authenticate: mockAuthenticate,
  AuthorizationError: class AuthorizationError extends Error {
    constructor(
      message: string,
      public resource: string,
      public action: string
    ) {
      super(message);
    }
  },
  InternalServerError: class InternalServerError extends Error {},
  successResponse: (data: unknown) => {
    const { NextResponse } = require('next/server');
    return NextResponse.json(data, { status: 200 });
  },
  withErrorHandling: (handler: (req: NextRequest) => Promise<unknown>) =>
    handler,
}));

mock.module('@babylon/db', () => ({
  asUser: mockAsUser,
}));

mock.module('@babylon/shared', () => ({
  AgentOnboardSchema: mockAgentOnboardSchema,
  generateSnowflakeId: mockGenerateSnowflakeId,
  logger: mockLogger,
}));

// Import after mocks
const { POST, GET } = await import('./route');

// ─── Test Helpers ────────────────────────────────────────────────────

const createMockRequest = (
  method: string,
  body?: Record<string, unknown>
): NextRequest =>
  ({
    url: 'https://example.com/api/agents/onboard',
    method,
    json: body ? () => Promise.resolve(body) : undefined,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? 'Bearer test-token' : null,
    },
  }) as unknown as NextRequest;

const MOCK_AGENT_USER = {
  userId: 'agent-test-123',
  privyId: 'agent-test-123',
  isAgent: true,
};

const MOCK_DB_USER = {
  id: '123456789012345678',
  username: 'agent-test-123',
  displayName: 'Test Agent',
  bio: 'Autonomous AI agent: agent-test-123',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  onChainRegistered: false,
  nftTokenId: null,
  registrationTxHash: null,
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('POST /api/agents/onboard', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockAsUser.mockReset();
    mockGetAgent0SDK.mockReset();
    mockSyncAfterAgent0Registration.mockReset();
    mockGenerateSnowflakeId.mockReset();
    mockParse.mockReset();
    mockLogger.info.mockReset();

    // Default: AGENT0 disabled
    process.env.AGENT0_ENABLED = 'false';
    process.env.BABYLON_GAME_WALLET_ADDRESS =
      '0xgamewallet000000000000000000000000000000';

    mockAuthenticate.mockResolvedValue(MOCK_AGENT_USER);
    mockParse.mockReturnValue({
      agentName: 'Test Agent',
      endpoint: 'https://example.com/a2a',
    });
    mockGenerateSnowflakeId.mockResolvedValue('123456789012345678');
  });

  describe('C2: walletAddress in select clause', () => {
    it('should include walletAddress in the DB select so agents use their own wallet', async () => {
      let capturedSelect: Record<string, boolean> | undefined;

      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          const mockDb = {
            user: {
              upsert: mock().mockResolvedValue(undefined),
              findUnique: mock().mockImplementation(
                (args: { select: Record<string, boolean> }) => {
                  capturedSelect = args.select;
                  return Promise.resolve(MOCK_DB_USER);
                }
              ),
            },
          };
          return operation(mockDb);
        }
      );

      const request = createMockRequest('POST', {
        agentName: 'Test Agent',
        endpoint: 'https://example.com/a2a',
      });
      await POST(request);

      expect(capturedSelect).toBeDefined();
      expect(capturedSelect!.walletAddress).toBe(true);
      expect(capturedSelect!.id).toBe(true);
      expect(capturedSelect!.bio).toBe(true);
    });

    it('should use agent wallet address over game wallet fallback', async () => {
      process.env.AGENT0_ENABLED = 'true';

      const agentWallet = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
      const dbUserWithWallet = { ...MOCK_DB_USER, walletAddress: agentWallet };

      // First call: upsert + findUnique (returns user with wallet)
      // Second call: update (persists registration)
      let asUserCallCount = 0;
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          asUserCallCount++;
          if (asUserCallCount === 1) {
            const mockDb = {
              user: {
                upsert: mock().mockResolvedValue(undefined),
                findUnique: mock().mockResolvedValue(dbUserWithWallet),
              },
            };
            return operation(mockDb);
          }
          // Second call is the DB update
          const mockDb = {
            user: {
              update: mock().mockResolvedValue(undefined),
            },
          };
          return operation(mockDb);
        }
      );

      // Mock SDK
      const mockAgent = {
        setA2A: mock().mockResolvedValue(undefined),
        setX402Support: mock(),
        setActive: mock(),
        addSkill: mock(),
        setMetadata: mock(),
        registerIPFS: mock().mockResolvedValue({
          waitMined: mock().mockResolvedValue({
            result: { agentId: '1:456', agentURI: 'ipfs://QmTest' },
          }),
        }),
      };
      mockGetAgent0SDK.mockReturnValue({
        createAgent: mock().mockReturnValue(mockAgent),
      });
      mockSyncAfterAgent0Registration.mockResolvedValue(undefined);

      const request = createMockRequest('POST', {
        agentName: 'Test Agent',
        endpoint: 'https://example.com/a2a',
      });
      const response = await POST(request);
      const data = await response.json();

      // Verify agent registered successfully (wallet was available)
      expect(data.agent0TokenId).toBe(456);
      expect(data.agent0MetadataCID).toBe('ipfs://QmTest');
    });
  });

  describe('C1: DB update after Agent0 registration', () => {
    it('should persist agent0TokenId, agent0MetadataCID, and onChainRegistered to DB', async () => {
      process.env.AGENT0_ENABLED = 'true';

      let capturedUpdateData:
        | {
            agent0TokenId: number;
            agent0MetadataCID: string | null;
            onChainRegistered: boolean;
          }
        | undefined;

      let asUserCallCount = 0;
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          asUserCallCount++;
          if (asUserCallCount === 1) {
            // First call: upsert + select
            return operation({
              user: {
                upsert: mock().mockResolvedValue(undefined),
                findUnique: mock().mockResolvedValue(MOCK_DB_USER),
              },
            });
          }
          // Second call: update after registration
          return operation({
            user: {
              update: mock().mockImplementation(
                (args: { data: typeof capturedUpdateData }) => {
                  capturedUpdateData = args.data;
                  return Promise.resolve(undefined);
                }
              ),
            },
          });
        }
      );

      const mockAgent = {
        setA2A: mock().mockResolvedValue(undefined),
        setX402Support: mock(),
        setActive: mock(),
        addSkill: mock(),
        setMetadata: mock(),
        registerIPFS: mock().mockResolvedValue({
          waitMined: mock().mockResolvedValue({
            result: { agentId: '1:789', agentURI: 'ipfs://QmTestCID' },
          }),
        }),
      };
      mockGetAgent0SDK.mockReturnValue({
        createAgent: mock().mockReturnValue(mockAgent),
      });
      mockSyncAfterAgent0Registration.mockResolvedValue(undefined);

      const request = createMockRequest('POST', {
        agentName: 'Test Agent',
        endpoint: 'https://example.com/a2a',
      });
      await POST(request);

      // Verify DB update was called with correct data
      expect(asUserCallCount).toBe(2);
      expect(capturedUpdateData).toBeDefined();
      expect(capturedUpdateData!.agent0TokenId).toBe(789);
      expect(capturedUpdateData!.agent0MetadataCID).toBe('ipfs://QmTestCID');
      expect(capturedUpdateData!.onChainRegistered).toBe(true);
    });

    it('should correctly parse tokenId from chainId:tokenId format', async () => {
      process.env.AGENT0_ENABLED = 'true';

      let capturedUpdateData: { agent0TokenId: number } | undefined;

      let asUserCallCount = 0;
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          asUserCallCount++;
          if (asUserCallCount === 1) {
            return operation({
              user: {
                upsert: mock().mockResolvedValue(undefined),
                findUnique: mock().mockResolvedValue(MOCK_DB_USER),
              },
            });
          }
          return operation({
            user: {
              update: mock().mockImplementation(
                (args: { data: typeof capturedUpdateData }) => {
                  capturedUpdateData = args.data;
                  return Promise.resolve(undefined);
                }
              ),
            },
          });
        }
      );

      // Return mainnet format "1:12345"
      const mockAgent = {
        setA2A: mock().mockResolvedValue(undefined),
        setX402Support: mock(),
        setActive: mock(),
        addSkill: mock(),
        setMetadata: mock(),
        registerIPFS: mock().mockResolvedValue({
          waitMined: mock().mockResolvedValue({
            result: { agentId: '1:12345', agentURI: 'ipfs://QmHash' },
          }),
        }),
      };
      mockGetAgent0SDK.mockReturnValue({
        createAgent: mock().mockReturnValue(mockAgent),
      });
      mockSyncAfterAgent0Registration.mockResolvedValue(undefined);

      const request = createMockRequest('POST', {
        agentName: 'Test Agent',
        endpoint: 'https://example.com/a2a',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.agent0TokenId).toBe(12345);
      expect(capturedUpdateData!.agent0TokenId).toBe(12345);
    });

    it('should call syncAfterAgent0Registration after DB update', async () => {
      process.env.AGENT0_ENABLED = 'true';

      const callOrder: string[] = [];

      let asUserCallCount = 0;
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          asUserCallCount++;
          if (asUserCallCount === 1) {
            return operation({
              user: {
                upsert: mock().mockResolvedValue(undefined),
                findUnique: mock().mockResolvedValue(MOCK_DB_USER),
              },
            });
          }
          callOrder.push('db_update');
          return operation({
            user: {
              update: mock().mockResolvedValue(undefined),
            },
          });
        }
      );

      const mockAgent = {
        setA2A: mock().mockResolvedValue(undefined),
        setX402Support: mock(),
        setActive: mock(),
        addSkill: mock(),
        setMetadata: mock(),
        registerIPFS: mock().mockResolvedValue({
          waitMined: mock().mockResolvedValue({
            result: { agentId: '1:100', agentURI: 'ipfs://Qm' },
          }),
        }),
      };
      mockGetAgent0SDK.mockReturnValue({
        createAgent: mock().mockReturnValue(mockAgent),
      });
      mockSyncAfterAgent0Registration.mockImplementation(async () => {
        callOrder.push('sync_reputation');
      });

      const request = createMockRequest('POST', {
        agentName: 'Test Agent',
        endpoint: 'https://example.com/a2a',
      });
      await POST(request);

      // DB update should happen before reputation sync
      expect(callOrder).toEqual(['db_update', 'sync_reputation']);
    });
  });

  describe('AGENT0_ENABLED=false', () => {
    it('should skip registration and return zero tokenId', async () => {
      process.env.AGENT0_ENABLED = 'false';

      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          return operation({
            user: {
              upsert: mock().mockResolvedValue(undefined),
              findUnique: mock().mockResolvedValue(MOCK_DB_USER),
            },
          });
        }
      );

      const request = createMockRequest('POST', {
        agentName: 'Test Agent',
        endpoint: 'https://example.com/a2a',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.agent0TokenId).toBe(0);
      expect(data.agent0MetadataCID).toBeNull();
      expect(data.registered).toBe(true);
      expect(mockGetAgent0SDK).not.toHaveBeenCalled();
    });
  });
});

describe('GET /api/agents/onboard', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockAsUser.mockReset();
    mockLogger.info.mockReset();

    mockAuthenticate.mockResolvedValue(MOCK_AGENT_USER);
  });

  describe('C3: status check uses agent0TokenId', () => {
    it('should report registered when agent0TokenId is set (even if nftTokenId is null)', async () => {
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          return operation({
            user: {
              findUniqueOrThrow: mock().mockResolvedValue({
                onChainRegistered: false,
                nftTokenId: null,
                agent0TokenId: 456,
                agent0MetadataCID: 'ipfs://QmTest',
                registrationTxHash: null,
              }),
            },
          });
        }
      );

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data.isRegistered).toBe(true);
      expect(data.tokenId).toBe(456);
      expect(data.agent0MetadataCID).toBe('ipfs://QmTest');
    });

    it('should report registered when onChainRegistered is true (even if agent0TokenId is null)', async () => {
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          return operation({
            user: {
              findUniqueOrThrow: mock().mockResolvedValue({
                onChainRegistered: true,
                nftTokenId: 42,
                agent0TokenId: null,
                agent0MetadataCID: null,
                registrationTxHash: '0xabc',
              }),
            },
          });
        }
      );

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data.isRegistered).toBe(true);
      expect(data.tokenId).toBe(42);
    });

    it('should report not registered when both onChainRegistered is false and agent0TokenId is null', async () => {
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          return operation({
            user: {
              findUniqueOrThrow: mock().mockResolvedValue({
                onChainRegistered: false,
                nftTokenId: null,
                agent0TokenId: null,
                agent0MetadataCID: null,
                registrationTxHash: null,
              }),
            },
          });
        }
      );

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data.isRegistered).toBe(false);
      expect(data.tokenId).toBeNull();
    });

    it('should prefer nftTokenId over agent0TokenId when both exist', async () => {
      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          return operation({
            user: {
              findUniqueOrThrow: mock().mockResolvedValue({
                onChainRegistered: true,
                nftTokenId: 100,
                agent0TokenId: 200,
                agent0MetadataCID: 'ipfs://QmBoth',
                registrationTxHash: '0xdef',
              }),
            },
          });
        }
      );

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data.isRegistered).toBe(true);
      // nftTokenId ?? agent0TokenId → nftTokenId takes precedence
      expect(data.tokenId).toBe(100);
      expect(data.agent0MetadataCID).toBe('ipfs://QmBoth');
    });

    it('should include agent0TokenId and agent0MetadataCID in select clause', async () => {
      let capturedSelect: Record<string, boolean> | undefined;

      mockAsUser.mockImplementation(
        async (
          _user: unknown,
          operation: (db: unknown) => Promise<unknown>
        ) => {
          return operation({
            user: {
              findUniqueOrThrow: mock().mockImplementation(
                (args: { select: Record<string, boolean> }) => {
                  capturedSelect = args.select;
                  return Promise.resolve({
                    onChainRegistered: false,
                    nftTokenId: null,
                    agent0TokenId: null,
                    agent0MetadataCID: null,
                    registrationTxHash: null,
                  });
                }
              ),
            },
          });
        }
      );

      const request = createMockRequest('GET');
      await GET(request);

      expect(capturedSelect).toBeDefined();
      expect(capturedSelect!.agent0TokenId).toBe(true);
      expect(capturedSelect!.agent0MetadataCID).toBe(true);
      expect(capturedSelect!.onChainRegistered).toBe(true);
    });
  });
});
