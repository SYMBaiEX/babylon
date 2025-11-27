/**
 * Unit Tests for GameDiscoveryService
 *
 * Tests game discovery functionality with mocked dependencies.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock SubgraphClient
const mockSubgraphClient = {
  getGamePlatforms: mock(async () => []),
  getAgent: mock(async () => null),
};

// Mock IPFSPublisher
const mockIpfsPublisher = {
  fetchMetadata: mock(async () => ({
    endpoints: {
      a2a: 'https://babylon.game/a2a',
      mcp: 'https://babylon.game/mcp',
      api: 'https://babylon.game/api',
    },
    capabilities: {
      markets: ['prediction'],
      actions: ['trade', 'post'],
      protocols: ['a2a', 'mcp'],
    },
  })),
};

// Mock the SubgraphClient module
mock.module('../SubgraphClient', () => ({
  SubgraphClient: class {
    getGamePlatforms = mockSubgraphClient.getGamePlatforms;
    getAgent = mockSubgraphClient.getAgent;
  },
}));

// Mock the IPFSPublisher module
mock.module('../IPFSPublisher', () => ({
  IPFSPublisher: class {
    fetchMetadata = mockIpfsPublisher.fetchMetadata;
  },
}));

// Import after mocking
const { GameDiscoveryService } = await import('../GameDiscovery');

describe('GameDiscoveryService', () => {
  let discovery: GameDiscoveryService;

  beforeEach(() => {
    // Reset mocks
    mockSubgraphClient.getGamePlatforms.mockReset();
    mockSubgraphClient.getAgent.mockReset();
    mockIpfsPublisher.fetchMetadata.mockReset();

    // Set default mock implementations
    mockSubgraphClient.getGamePlatforms.mockImplementation(async () => []);
    mockSubgraphClient.getAgent.mockImplementation(async () => null);
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
    mockSubgraphClient.getGamePlatforms.mockResolvedValue([]);

    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction'],
    });

    expect(Array.isArray(games)).toBe(true);
    expect(games).toHaveLength(0);
  });

  test('discoverGames returns games from subgraph', async () => {
    mockSubgraphClient.getGamePlatforms.mockResolvedValue([
      {
        tokenId: 1,
        name: 'Babylon',
        type: 'game-platform',
        metadataCID: 'QmTestCID',
        a2aEndpoint: 'https://babylon.game/a2a',
        mcpEndpoint: 'https://babylon.game/mcp',
        reputation: { trustScore: 85 },
      },
    ]);

    mockIpfsPublisher.fetchMetadata.mockResolvedValue({
      endpoints: {
        a2a: 'https://babylon.game/a2a',
        mcp: 'https://babylon.game/mcp',
        api: 'https://babylon.game/api',
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
    expect(games[0]?.endpoints.a2a).toBe('https://babylon.game/a2a');
    expect(games[0]?.capabilities.markets).toContain('prediction');
  });

  test('findBabylon returns null when not found', async () => {
    mockSubgraphClient.getGamePlatforms.mockResolvedValue([]);

    const babylon = await discovery.findBabylon(1); // Only 1 retry for test speed

    expect(babylon).toBeNull();
  });

  test('getGameByTokenId returns null for unknown token', async () => {
    mockSubgraphClient.getAgent.mockResolvedValue(null);

    const game = await discovery.getGameByTokenId(999);

    expect(game).toBeNull();
  });

  test('getGameByTokenId returns game for valid token', async () => {
    mockSubgraphClient.getAgent.mockResolvedValue({
      tokenId: 1,
      name: 'Babylon',
      type: 'game-platform',
      metadataCID: 'QmTestCID',
      a2aEndpoint: 'https://babylon.game/a2a',
      mcpEndpoint: 'https://babylon.game/mcp',
    });

    mockIpfsPublisher.fetchMetadata.mockResolvedValue({
      endpoints: {
        a2a: 'https://babylon.game/a2a',
        mcp: 'https://babylon.game/mcp',
        api: 'https://babylon.game/api',
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
    mockSubgraphClient.getGamePlatforms.mockResolvedValue([
      {
        tokenId: 1,
        name: 'Game 1',
        type: 'game-platform',
        metadataCID: 'QmCID1',
      },
      {
        tokenId: 2,
        name: 'Game 2',
        type: 'trading-platform',
        metadataCID: 'QmCID2',
      },
    ]);

    const games = await discovery.discoverGames({
      type: 'game-platform',
    });

    expect(games).toHaveLength(1);
    expect(games[0]?.name).toBe('Game 1');
  });
});
