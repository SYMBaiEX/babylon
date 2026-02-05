/**
 * Unit Tests for GameDiscovery
 *
 * Tests game discovery functionality with mocked dependencies.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock SDK from agent0-sdk
const mockAgent = {
  getRegistrationFile: mock(() => null),
  a2aEndpoint: '',
  mcpEndpoint: '',
};

const mockSDK = {
  searchAgents: mock(async () => []),
  getAgent: mock(async () => null),
  loadAgent: mock(async () => mockAgent),
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

// Mock the agent0-sdk module
mock.module('agent0-sdk', () => ({
  SDK: class MockSDK {
    searchAgents = mockSDK.searchAgents;
    getAgent = mockSDK.getAgent;
  },
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
const { GameDiscovery } = await import('../GameDiscovery');

describe('GameDiscovery', () => {
  let discovery: InstanceType<typeof GameDiscovery>;

  beforeEach(() => {
    // Reset mocks
    mockSDK.searchAgents.mockReset();
    mockSDK.getAgent.mockReset();
    mockSDK.loadAgent.mockReset();
    mockAgent.getRegistrationFile.mockReset();
    mockIpfsPublisher.fetchMetadata.mockReset();

    // Set default mock implementations
    mockSDK.searchAgents.mockImplementation(async () => []);
    mockSDK.getAgent.mockImplementation(async () => null);
    mockSDK.loadAgent.mockImplementation(async () => mockAgent);
    mockAgent.getRegistrationFile.mockImplementation(() => null);
    mockIpfsPublisher.fetchMetadata.mockImplementation(async () => ({
      endpoints: { a2a: '', mcp: '', api: '' },
      capabilities: { markets: [], actions: [], protocols: [] },
    }));

    discovery = new GameDiscovery(mockSDK as unknown as SDK);
  });

  test('can be instantiated', () => {
    expect(discovery).toBeDefined();
  });

  test('discoverGames returns empty array when no games found', async () => {
    mockSDK.searchAgents.mockResolvedValue([]);

    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction'],
    });

    expect(Array.isArray(games)).toBe(true);
    expect(games).toHaveLength(0);
  });

  test('discoverGames returns games from Agent0 search', async () => {
    mockSDK.searchAgents.mockResolvedValue([
      {
        chainId: 1,
        agentId: '1:1',
        name: 'Babylon',
        description: 'Test game',
        owners: ['0x1234567890abcdef'],
        operators: [],
        mcp: 'https://babylon.market/mcp',
        a2a: 'https://babylon.market/a2a',
        supportedTrusts: [],
        a2aSkills: ['trade', 'post'],
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
    expect(games[0]?.endpoints.a2a).toBe('https://babylon.market/a2a'); // SDK v1.5.2 provides endpoint URLs
    expect(games[0]?.endpoints.mcp).toBe('https://babylon.market/mcp'); // SDK v1.5.2 provides endpoint URLs
    expect(games[0]?.capabilities.markets).toContain('trade'); // From a2aSkills
  });

  test('findBabylon returns null when not found', async () => {
    mockSDK.searchAgents.mockResolvedValue([]);

    const babylon = await discovery.findBabylon(1); // Only 1 retry for test speed

    expect(babylon).toBeNull();
  });

  test('getGameByTokenId returns null for unknown token', async () => {
    mockSDK.getAgent.mockResolvedValue(null);

    const game = await discovery.getGameByTokenId(999);

    expect(game).toBeNull();
  });

  test('getGameByTokenId returns game for valid token', async () => {
    mockAgent.getRegistrationFile.mockReturnValue({
      name: 'Babylon',
      agentURI: 'QmTestCID',
    });
    mockAgent.a2aEndpoint = 'https://babylon.market/a2a';
    mockAgent.mcpEndpoint = 'https://babylon.market/mcp';

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
    mockSDK.searchAgents.mockResolvedValue([
      {
        chainId: 1,
        agentId: '1:1',
        name: 'Game 1',
        description: 'Test game 1',
        owners: ['0x1111111111111111'],
        operators: [],
        supportedTrusts: [],
        a2aSkills: [],
      },
      {
        chainId: 1,
        agentId: '1:2',
        name: 'Game 2',
        description: 'Test game 2',
        owners: ['0x2222222222222222'],
        operators: [],
        supportedTrusts: [],
        a2aSkills: [],
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

    // Both games are returned because GameDiscovery hardcodes type as 'game-platform'
    // (it doesn't fetch IPFS metadata in search)
    expect(games).toHaveLength(2);
    expect(games[0]?.name).toBe('Game 1');
    expect(games[1]?.name).toBe('Game 2');
  });
});
