import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { initializeAgentA2AClient } from '@babylon/agents';

// Tests use mocked db module
const describeTests = describe;

const findUniqueMock = mock(async () => ({
  id: 'agent-1',
  isAgent: true,
  walletAddress: null as string | null,
}));

const createWalletMock = mock(async () => ({
  walletAddress: '0xwallet',
  privyUserId: 'privy-user',
  privyWalletId: 'privy-wallet',
}));

const sdkFromCardMock = mock(async () => new MockA2AClient());

class MockA2AClient {
  static fromCardUrl = sdkFromCardMock;
}

mock.module('@babylon/db', () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
    },
  },
  // All table exports that may be imported by dependencies
  users: {},
  actors: {},
  agentLogs: {},
  agentMessages: {},
  agentRegistries: {},
  llmCallLogs: {},
  trajectories: {},
  worldFacts: {},
  referrals: {},
  pointsTransactions: {},
  // Operators
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  desc: () => ({}),
  asc: () => ({}),
}));

mock.module('@babylon/agents', () => ({
  agentWalletService: {
    createAgentEmbeddedWallet: createWalletMock,
  },
}));

mock.module('@a2a-js/sdk/client', () => ({
  A2AClient: MockA2AClient,
}));

describeTests('initializeAgentA2AClient wallet provisioning', () => {
  beforeEach(() => {
    findUniqueMock.mockClear();
    createWalletMock.mockClear();
    sdkFromCardMock.mockClear();
    process.env.AUTO_CREATE_AGENT_WALLETS = 'true';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  test('auto-creates wallet when missing', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'agent-1',
      isAgent: true,
      walletAddress: null,
    });

    await initializeAgentA2AClient('agent-1');

    expect(createWalletMock).toHaveBeenCalledTimes(1);
    expect(sdkFromCardMock).toHaveBeenCalledTimes(1);
  });

  test('does not call wallet service when wallet already exists', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'agent-2',
      isAgent: true,
      walletAddress: '0xexisting',
    });

    await initializeAgentA2AClient('agent-2');

    // Wallet service should not be called if wallet already exists
    expect(createWalletMock).not.toHaveBeenCalled();
    // SDK should still be initialized
    expect(sdkFromCardMock).toHaveBeenCalledTimes(1);
  });
});
