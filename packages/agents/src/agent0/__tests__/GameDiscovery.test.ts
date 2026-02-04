/**
 * Unit Tests for GameDiscoveryService
 *
 * Tests game discovery functionality with mocked dependencies.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock Agent0Client
const mockAgent0Client = {
  ensureAvailable: mock(async () => true),
  isAvailable: mock(() => true),
  searchAgents: mock(async () => []),
  getAgentProfile: mock(async () => null),
};

// Mock IPFSPublisher
const mockIpfsPublisher = {
  fetchMetadata: mock(async () => ({
    endpoints: {
      a2a: 'https://babylon.market/a2a',
      mcp: 'https://babylon.market/mcp',
      api: 'https://babylon.market/api',
    },
    capabilities: {
      markets: ['prediction'],
      actions: ['trade', 'post'],
      protocols: ['a2a', 'mcp'],
    },
  })),
};

// Mock the Agent0Client module
mock.module('../Agent0Client', () => ({
  getAgent0Client: () => mockAgent0Client,
}));

// Re-export the real AgentMetadataSchema to prevent breaking other test files
// eslint-disable-next-line @typescript-eslint/no-require-imports
const realIPFSPublisher = require('../IPFSPublisher');

// Mock the IPFSPublisher module (include all exports to prevent interference with other tests)
mock.module('../IPFSPublisher', () => ({
  ...realIPFSPublisher,
  IPFSPublisher: class {
    fetchMetadata = mockIpfsPublisher.fetchMetadata;
    isAvailable = () => true;
    getGatewayUrl = (cid: string) => `https://gateway.pinata.cloud/ipfs/${cid}`;
  },
}));

// Import after mocking
const { GameDiscoveryService } = await import('../GameDiscovery');

describe('GameDiscoveryService', () => {
  let discovery: InstanceType<typeof GameDiscoveryService>;

  beforeEach(() => {
    // Reset mocks
    mockAgent0Client.searchAgents.mockReset();
    mockAgent0Client.getAgentProfile.mockReset();
    mockIpfsPublisher.fetchMetadata.mockReset();

    // Set default mock implementations
    mockAgent0Client.ensureAvailable.mockImplementation(async () => true);
    mockAgent0Client.isAvailable.mockImplementation(() => true);
    mockAgent0Client.searchAgents.mockImplementation(async () => []);
    mockAgent0Client.getAgentProfile.mockImplementation(async () => null);
    mockIpfsPublisher.fetchMetadata.mockImplementation(async () => ({
      endpoints: { a2a: '', mcp: '', api: '' },
      capabilities: { markets: [], actions: [], protocols: [] },
    }));

    discovery = new GameDiscoveryService();
  });

  test('can be instantiated', () => {
    expect(discovery).toBeDefined();
  });

  test('discoverGames returns empty array when no games found', async () => {
    mockAgent0Client.searchAgents.mockResolvedValue([]);

    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction'],
    });

    expect(Array.isArray(games)).toBe(true);
    expect(games).toHaveLength(0);
  });

  test('discoverGames returns games from Agent0 search', async () => {
    mockAgent0Client.searchAgents.mockResolvedValue([
      {
        tokenId: 1,
        name: 'Babylon',
        metadataCID: 'QmTestCID',
        walletAddress: '0x1234567890abcdef',
        capabilities: {
          markets: ['prediction', 'perpetuals'],
          actions: ['trade', 'post', 'comment'],
          a2aEndpoint: 'https://babylon.market/a2a',
          mcpEndpoint: 'https://babylon.market/mcp',
        },
        reputation: {
          trustScore: 85,
          accuracyScore: 85,
        },
      },
    ]);

    mockIpfsPublisher.fetchMetadata.mockResolvedValue({
      type: 'game-platform',
      endpoints: {
        a2a: 'https://babylon.market/a2a',
        mcp: 'https://babylon.market/mcp',
        api: 'https://babylon.market/api',
      },
      capabilities: {
        markets: ['prediction', 'perpetuals'],
        actions: ['trade', 'post', 'comment'],
        protocols: ['a2a', 'mcp'],
      },
    });

    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction'],
    });

    expect(Array.isArray(games)).toBe(true);
    expect(games).toHaveLength(1);
    expect(games[0]?.name).toBe('Babylon');
    expect(games[0]?.tokenId).toBe(1);
    expect(games[0]?.endpoints.a2a).toBe('https://babylon.market/a2a');
    expect(games[0]?.capabilities.markets).toContain('prediction');
  });

  test('findBabylon returns null when not found', async () => {
    mockAgent0Client.searchAgents.mockResolvedValue([]);

    const babylon = await discovery.findBabylon(1); // Only 1 retry for test speed

    expect(babylon).toBeNull();
  });

  test('getGameByTokenId returns null for unknown token', async () => {
    mockAgent0Client.getAgentProfile.mockResolvedValue(null);

    const game = await discovery.getGameByTokenId(999);

    expect(game).toBeNull();
  });

  test('getGameByTokenId returns game for valid token', async () => {
    mockAgent0Client.getAgentProfile.mockResolvedValue({
      tokenId: 1,
      name: 'Babylon',
      metadataCID: 'QmTestCID',
      walletAddress: '0x1234567890abcdef',
      capabilities: {
        markets: ['prediction'],
        actions: ['trade'],
      },
      endpoints: [
        { type: 'A2A', value: 'https://babylon.market/a2a' },
        { type: 'MCP', value: 'https://babylon.market/mcp' },
      ],
      reputation: {
        trustScore: 85,
        accuracyScore: 85,
      },
    });

    mockIpfsPublisher.fetchMetadata.mockResolvedValue({
      type: 'game-platform',
      endpoints: {
        a2a: 'https://babylon.market/a2a',
        mcp: 'https://babylon.market/mcp',
        api: 'https://babylon.market/api',
      },
      capabilities: {
        markets: ['prediction'],
        actions: ['trade'],
        protocols: ['a2a'],
      },
    });

    const game = await discovery.getGameByTokenId(1);

    expect(game).not.toBeNull();
    expect(game?.name).toBe('Babylon');
    expect(game?.tokenId).toBe(1);
  });

  test('filters games by type', async () => {
    mockAgent0Client.searchAgents.mockResolvedValue([
      {
        tokenId: 1,
        name: 'Game 1',
        metadataCID: 'QmCID1',
        walletAddress: '0x1111111111111111',
        capabilities: {},
        reputation: { trustScore: 0, accuracyScore: 0 },
      },
      {
        tokenId: 2,
        name: 'Game 2',
        metadataCID: 'QmCID2',
        walletAddress: '0x2222222222222222',
        capabilities: {},
        reputation: { trustScore: 0, accuracyScore: 0 },
      },
    ]);

    // First game is game-platform, second is trading-platform
    mockIpfsPublisher.fetchMetadata
      .mockResolvedValueOnce({
        type: 'game-platform',
        endpoints: { a2a: '', mcp: '', api: '' },
        capabilities: { markets: [], actions: [], protocols: [] },
      })
      .mockResolvedValueOnce({
        type: 'trading-platform',
        endpoints: { a2a: '', mcp: '', api: '' },
        capabilities: { markets: [], actions: [], protocols: [] },
      });

    const games = await discovery.discoverGames({
      type: 'game-platform',
    });

    expect(games).toHaveLength(1);
    expect(games[0]?.name).toBe('Game 1');
  });
});
