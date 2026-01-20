import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Tests use mocked db module
const describeTests = describe;

const a2aClientConstructorMock = mock((..._args: unknown[]) => undefined);

const findUniqueMock = mock(async () => ({
  id: 'agent-1',
  isAgent: true,
  walletAddress: null as string | null,
  agent0TokenId: null as number | null,
  displayName: 'Test Agent',
}));

const createWalletMock = mock(async () => ({
  walletAddress: '0xwallet',
  privyUserId: 'privy-user',
  privyWalletId: 'privy-wallet',
}));

class MockA2AClient {
  constructor(...args: unknown[]) {
    a2aClientConstructorMock(...args);
  }
}

// Mock fetch to return a valid agent card
const originalFetch = globalThis.fetch;

/**
 * Create a typed fetch mock that satisfies Bun's fetch signature
 * Bun's fetch has a preconnect property that must be present
 */
function createFetchMock(): typeof fetch {
  const mockImpl = async (
    url: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const urlStr =
      typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;
    if (urlStr.includes('agent-card.json')) {
      return new Response(JSON.stringify({ name: 'test-agent', skills: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, init);
  };

  // Use Object.assign to copy preconnect from original fetch
  return Object.assign(mockImpl, {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch;
}

const mockFetch = createFetchMock();

mock.module('@babylon/db', () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}));

mock.module('@babylon/engine', () => ({
  StaticDataRegistry: {
    getActor: () => null,
  },
}));

// Mock the internal AgentWalletService module (not the whole @babylon/agents package)
// This allows initializeAgentA2AClient to work while mocking agentWalletService
mock.module('../../agents/src/identity/AgentWalletService', () => ({
  agentWalletService: {
    createAgentEmbeddedWallet: createWalletMock,
  },
}));

mock.module('@a2a-js/sdk/client', () => ({
  A2AClient: MockA2AClient,
}));

// Dynamic import AFTER mocks are set up
const { initializeAgentA2AClient } = await import(
  '../../agents/src/plugins/babylon/integration-a2a-sdk'
);

describeTests('initializeAgentA2AClient wallet provisioning', () => {
  beforeEach(() => {
    findUniqueMock.mockClear();
    createWalletMock.mockClear();
    a2aClientConstructorMock.mockClear();
    // Reset mock call counts (mockFetch is already properly typed)
    // Mock global fetch to return agent card
    globalThis.fetch = mockFetch;
    process.env.AUTO_CREATE_AGENT_WALLETS = 'true';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  test('auto-creates wallet when missing', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'agent-1',
      isAgent: true,
      walletAddress: null,
      agent0TokenId: null,
      displayName: 'Test Agent 1',
    });

    await initializeAgentA2AClient('agent-1');

    expect(createWalletMock).toHaveBeenCalledTimes(1);
    expect(a2aClientConstructorMock).toHaveBeenCalledTimes(1);
  });

  test('does not call wallet service when wallet already exists', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'agent-2',
      isAgent: true,
      walletAddress: '0xexisting',
      agent0TokenId: 123,
      displayName: 'Test Agent 2',
    });

    await initializeAgentA2AClient('agent-2');

    // Wallet service should not be called if wallet already exists
    expect(createWalletMock).not.toHaveBeenCalled();
    // SDK should still be initialized
    expect(a2aClientConstructorMock).toHaveBeenCalledTimes(1);
  });
});
