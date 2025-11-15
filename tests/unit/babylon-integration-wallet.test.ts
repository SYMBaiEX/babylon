import { describe, test, expect, beforeEach, mock } from 'bun:test'

const findUniqueMock = mock(async () => ({
  id: 'agent-1',
  isAgent: true,
  walletAddress: null as string | null
}))

const createWalletMock = mock(async () => ({
  walletAddress: '0xwallet',
  privyUserId: 'privy-user',
  privyWalletId: 'privy-wallet'
}))

const sdkFromCardMock = mock(async () => new MockA2AClient())

class MockA2AClient {
  static fromCardUrl = sdkFromCardMock
}

mock.module('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock
    }
  }
}))

mock.module('@/lib/agents/identity/AgentWalletService', () => ({
  agentWalletService: {
    createAgentEmbeddedWallet: createWalletMock
  }
}))

mock.module('@a2a-js/sdk/client', () => ({
  A2AClient: MockA2AClient
}))

describe('initializeAgentA2AClientOfficial wallet provisioning', () => {
  beforeEach(() => {
  findUniqueMock.mockClear()
  createWalletMock.mockClear()
  sdkFromCardMock.mockClear()
    process.env.AUTO_CREATE_AGENT_WALLETS = 'true'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  test('auto-creates wallet when missing', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'agent-1',
      isAgent: true,
      walletAddress: null
    })

    const { initializeAgentA2AClientOfficial } = await import('@/lib/agents/plugins/babylon/integration-official-sdk-complete')
    await initializeAgentA2AClientOfficial('agent-1')

    expect(createWalletMock).toHaveBeenCalledTimes(1)
    expect(sdkFromCardMock).toHaveBeenCalledTimes(1)
  })

  test('does not call wallet service when wallet already exists', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'agent-2',
      isAgent: true,
      walletAddress: '0xexisting'
    })

    const { initializeAgentA2AClientOfficial } = await import('@/lib/agents/plugins/babylon/integration-official-sdk-complete')
    await initializeAgentA2AClientOfficial('agent-2')

    expect(createWalletMock).not.toHaveBeenCalled()
    expect(sdkFromCardMock).toHaveBeenCalledTimes(1)
  })
})

