import { describe, expect, it, spyOn, mock, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { predictionMarketsPlugin, BabylonClientService, BabylonTradingService } from '../plugin';
import {
  type IAgentRuntime,
  type Memory,
  type State,
  type Content,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import {
  createMockRuntime,
  createTestMemory,
  createTestState,
  createUUID,
  testFixtures,
} from './test-utils';

// Mock the API client and auth service
import { BabylonApiClient } from '../api-client';
import { AgentAuthService } from '../agent-auth-service';

// Mock modules
const mockFetch = global.fetch as any;

interface TestCallbackContent {
  text?: string;
  action?: string;
  source?: string;
}

interface TestActionResult {
  text?: string;
  success: boolean;
  data?: {
    actions?: string[];
    source?: string;
  };
  error?: Error | string;
}

// Setup environment variables
beforeAll(() => {
  spyOn(logger, 'info');
  spyOn(logger, 'error');
  spyOn(logger, 'warn');
  spyOn(logger, 'debug');
});

afterAll(() => {
  // Cleanup if needed
});

describe('Plugin Configuration', () => {
  it('should have correct plugin metadata', () => {
    expect(predictionMarketsPlugin.name).toBe('babylon');
    expect(predictionMarketsPlugin.description).toBeDefined();
    expect(predictionMarketsPlugin.description.length).toBeGreaterThan(0);
    expect(predictionMarketsPlugin.actions).toBeDefined();
    expect(predictionMarketsPlugin.actions?.length).toBeGreaterThanOrEqual(3);
    expect(predictionMarketsPlugin.evaluators).toBeDefined();
    expect(predictionMarketsPlugin.evaluators?.length).toBeGreaterThanOrEqual(2);
    expect(predictionMarketsPlugin.providers).toBeDefined();
    expect(predictionMarketsPlugin.providers?.length).toBeGreaterThanOrEqual(3);
    expect(predictionMarketsPlugin.services).toBeDefined();
    expect(predictionMarketsPlugin.services?.length).toBe(2);
  });

  it('should initialize with valid configuration', async () => {
    const runtime = createMockRuntime();
    const config = {
      BABYLON_API_URL: 'http://localhost:3000',
      BABYLON_AGENT_ID: 'test-agent',
      BABYLON_MAX_TRADE_SIZE: '100',
      BABYLON_MAX_POSITION_SIZE: '500',
      BABYLON_MIN_CONFIDENCE: '0.6',
    };

    if (predictionMarketsPlugin.init) {
      await predictionMarketsPlugin.init(config);
      expect(process.env.BABYLON_API_URL).toBe('http://localhost:3000');
    }
  });

  it('should handle initialization without config', async () => {
    if (predictionMarketsPlugin.init) {
      // Init should not throw even with empty config
      await predictionMarketsPlugin.init({});
    }
  });

  it('should throw error for invalid configuration', async () => {
    const invalidConfig = {
      BABYLON_API_URL: 'not-a-url',
      BABYLON_MAX_TRADE_SIZE: '-100', // Invalid: negative number
    };

    if (predictionMarketsPlugin.init) {
      await expect(predictionMarketsPlugin.init(invalidConfig)).rejects.toThrow(
        'Invalid plugin configuration'
      );
    }
  });

  it('should handle ZodError with issues array correctly', async () => {
    const invalidConfig = {
      BABYLON_MAX_TRADE_SIZE: 'invalid-number',
    };

    if (predictionMarketsPlugin.init) {
      try {
        await predictionMarketsPlugin.init(invalidConfig);
        throw new Error('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('Invalid plugin configuration');
      }
    }
  });
});

describe('BUY_SHARES Action', () => {
  let runtime: IAgentRuntime;
  let buyAction: any;

  beforeEach(() => {
    runtime = createMockRuntime();
    buyAction = predictionMarketsPlugin.actions?.find((a) => a.name === 'BUY_SHARES');
  });

  it('should have buy shares action', () => {
    expect(buyAction).toBeDefined();
    expect(buyAction?.name).toBe('BUY_SHARES');
    expect(buyAction?.similes).toContain('BUY');
    expect(buyAction?.similes).toContain('PLACE_BET');
  });

  it('should validate buy intent messages', async () => {
    if (!buyAction?.validate) {
      throw new Error('BUY_SHARES action validate not found');
    }

    // Mock Babylon service
    const mockBabylonService = {
      getClient: () => ({
        buyShares: async () => ({ success: true }),
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const buyMessages = [
      'buy shares',
      'place a bet',
      'take position on market',
      'go long on yes',
      'yes on market 123',
    ];

    for (const text of buyMessages) {
      const message = createTestMemory({
        content: { text, source: 'test' },
      });
      const isValid = await buyAction.validate(runtime, message);
      expect(isValid).toBe(true);
    }
  });

  it('should reject messages without buy intent', async () => {
    if (!buyAction?.validate) {
      throw new Error('BUY_SHARES action validate not found');
    }

    runtime.getService = mock(() => null);

    const nonBuyMessages = ['hello', 'what is the weather', 'tell me a joke'];

    for (const text of nonBuyMessages) {
      const message = createTestMemory({
        content: { text, source: 'test' },
      });
      const isValid = await buyAction.validate(runtime, message);
      expect(isValid).toBe(false);
    }
  });

  it('should handle buy action with callback', async () => {
    if (!buyAction?.handler) {
      throw new Error('BUY_SHARES action handler not found');
    }

    // Mock Babylon service and client
    const mockClient = {
      buyShares: mock().mockResolvedValue({
        success: true,
        shares: 10,
        avgPrice: 0.6,
      }),
      getWallet: mock().mockResolvedValue({
        balance: 1000,
        availableBalance: 500,
        lockedBalance: 500,
      }),
    };

    const mockBabylonService = {
      getClient: () => mockClient,
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const message = createTestMemory({
      content: { text: 'buy yes shares on market 123', source: 'test' },
    });

    const state = createTestState({
      data: {},
      marketId: '123',
      side: 'yes',
      amount: 10,
    } as any);

    let callbackContent: TestCallbackContent | null = null;
    const callback: HandlerCallback = async (content: Content) => {
      callbackContent = content as TestCallbackContent;
      return [];
    };

    const result = await buyAction.handler(runtime, message, state, undefined, callback);

    expect(result).toHaveProperty('success');
    // The handler calls buyShares if marketId is provided
    if (result.success) {
      expect(mockClient.buyShares).toHaveBeenCalled();
    }
  });

  it('should handle errors gracefully', async () => {
    if (!buyAction?.handler) {
      throw new Error('BUY_SHARES action handler not found');
    }

    runtime.getService = mock(() => null);

    const message = createTestMemory({
      content: { text: 'buy shares', source: 'test' },
    });

    const result = await buyAction.handler(runtime, message, undefined, undefined, undefined);

    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
  });
});

describe('SELL_SHARES Action', () => {
  let runtime: IAgentRuntime;
  let sellAction: any;

  beforeEach(() => {
    runtime = createMockRuntime();
    sellAction = predictionMarketsPlugin.actions?.find((a) => a.name === 'SELL_SHARES');
  });

  it('should have sell shares action', () => {
    expect(sellAction).toBeDefined();
    expect(sellAction?.name).toBe('SELL_SHARES');
    expect(sellAction?.similes).toContain('SELL');
    expect(sellAction?.similes).toContain('CLOSE_POSITION');
  });

  it('should validate sell intent messages', async () => {
    if (!sellAction?.validate) {
      throw new Error('SELL_SHARES action validate not found');
    }

    const mockBabylonService = {
      getClient: () => ({
        sellShares: async () => ({ success: true }),
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const sellMessages = ['sell shares', 'exit position', 'close position', 'sell my shares'];

    for (const text of sellMessages) {
      const message = createTestMemory({
        content: { text, source: 'test' },
      });
      const isValid = await sellAction.validate(runtime, message);
      expect(isValid).toBe(true);
    }
  });
});

describe('CHECK_WALLET Action', () => {
  let runtime: IAgentRuntime;
  let checkWalletAction: any;

  beforeEach(() => {
    runtime = createMockRuntime();
    checkWalletAction = predictionMarketsPlugin.actions?.find((a) => a.name === 'CHECK_WALLET');
  });

  it('should have check wallet action', () => {
    expect(checkWalletAction).toBeDefined();
    expect(checkWalletAction?.name).toBe('CHECK_WALLET');
  });

  it('should validate wallet check messages', async () => {
    if (!checkWalletAction?.validate) {
      throw new Error('CHECK_WALLET action validate not found');
    }

    const mockBabylonService = {
      getClient: () => ({
        getWallet: async () => ({
          balance: 1000,
          availableBalance: 500,
          lockedBalance: 500,
        }),
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const walletMessages = ['check wallet', 'wallet balance', 'show my balance'];

    for (const text of walletMessages) {
      const message = createTestMemory({
        content: { text, source: 'test' },
      });
      const isValid = await checkWalletAction.validate(runtime, message);
      expect(isValid).toBe(true);
    }
  });
});

describe('Market Analysis Evaluator', () => {
  const evaluator = predictionMarketsPlugin.evaluators?.find((e) => e.name === 'MARKET_ANALYSIS');
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should have market analysis evaluator', () => {
    expect(evaluator).toBeDefined();
    expect(evaluator?.name).toBe('MARKET_ANALYSIS');
  });

  it('should validate analysis intent', async () => {
    if (!evaluator?.validate) {
      throw new Error('MARKET_ANALYSIS evaluator validate not found');
    }

    const mockBabylonService = {
      getClient: () => ({
        getActiveMarkets: async () => [],
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const analysisMessages = [
      'analyze markets',
      'what do you think about market 123',
      'should i buy',
      'your opinion on this market',
    ];

    for (const text of analysisMessages) {
      const message = createTestMemory({
        content: { text, source: 'test' },
      });
      const isValid = await evaluator.validate(runtime, message);
      expect(isValid).toBe(true);
    }
  });
});

describe('Portfolio Management Evaluator', () => {
  const evaluator = predictionMarketsPlugin.evaluators?.find(
    (e) => e.name === 'PORTFOLIO_MANAGEMENT'
  );
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should have portfolio management evaluator', () => {
    expect(evaluator).toBeDefined();
    expect(evaluator?.name).toBe('PORTFOLIO_MANAGEMENT');
  });

  it('should validate portfolio review intent', async () => {
    if (!evaluator?.validate) {
      throw new Error('PORTFOLIO_MANAGEMENT evaluator validate not found');
    }

    const mockBabylonService = {
      getClient: () => ({
        getPositions: async () => [],
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const portfolioMessages = ['review portfolio', 'check positions', 'portfolio status'];

    for (const text of portfolioMessages) {
      const message = createTestMemory({
        content: { text, source: 'test' },
      });
      const isValid = await evaluator.validate(runtime, message);
      expect(isValid).toBe(true);
    }
  });
});

describe('Market Data Provider', () => {
  const provider = predictionMarketsPlugin.providers?.find((p) => p.name === 'marketDataProvider');
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should have market data provider', () => {
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('marketDataProvider');
  });

  it('should provide market data', async () => {
    if (!provider?.get) {
      throw new Error('marketDataProvider not found');
    }

    const mockMarkets = [
      {
        id: '1',
        question: 'Test question',
        yesPrice: 0.6,
        noPrice: 0.4,
        totalVolume: 1000,
      },
    ];

    const mockBabylonService = {
      getClient: () => ({
        getActiveMarkets: async () => mockMarkets,
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const message = createTestMemory();
    const state = createTestState();

    const result = await provider.get(runtime, message, state);

    expect(result).toHaveProperty('text');
    expect(result.text).toContain('Market Overview');
    expect(result).toHaveProperty('data');
  });

  it('should handle service not available', async () => {
    if (!provider?.get) {
      throw new Error('marketDataProvider not found');
    }

    runtime.getService = mock(() => null);

    const message = createTestMemory();
    const state = createTestState();

    const result = await provider.get(runtime, message, state);

    expect(result).toHaveProperty('text');
    expect(result.text).toContain('unavailable');
  });
});

describe('Wallet Status Provider', () => {
  const provider = predictionMarketsPlugin.providers?.find(
    (p) => p.name === 'walletStatusProvider'
  );
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should have wallet status provider', () => {
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('walletStatusProvider');
  });

  it('should provide wallet status', async () => {
    if (!provider?.get) {
      throw new Error('walletStatusProvider not found');
    }

    const mockWallet = {
      balance: 1000,
      availableBalance: 500,
      lockedBalance: 500,
    };

    const mockBabylonService = {
      getClient: () => ({
        getWallet: async () => mockWallet,
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const message = createTestMemory();
    const state = createTestState();

    const result = await provider.get(runtime, message, state);

    expect(result).toHaveProperty('text');
    expect(result.text).toContain('Wallet Status');
    expect(result).toHaveProperty('data');
  });
});

describe('Position Summary Provider', () => {
  const provider = predictionMarketsPlugin.providers?.find(
    (p) => p.name === 'positionSummaryProvider'
  );
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should have position summary provider', () => {
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('positionSummaryProvider');
  });

  it('should provide position summary', async () => {
    if (!provider?.get) {
      throw new Error('positionSummaryProvider not found');
    }

    const mockPositions = [
      {
        id: '1',
        marketId: '123',
        side: true,
        shares: 10,
        avgPrice: 0.6,
        currentValue: 12,
        pnl: 2,
      },
    ];

    const mockBabylonService = {
      getClient: () => ({
        getPositions: async () => mockPositions,
      }),
    };
    runtime.getService = mock(() => mockBabylonService as any);

    const message = createTestMemory();
    const state = createTestState();

    const result = await provider.get(runtime, message, state);

    expect(result).toHaveProperty('text');
    expect(result.text).toContain('Position Summary');
    expect(result).toHaveProperty('data');
  });
});

describe('BabylonClientService', () => {
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should start the service', async () => {
    const service = await BabylonClientService.start(runtime);
    expect(service).toBeInstanceOf(BabylonClientService);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should have correct service type', () => {
    expect(BabylonClientService.serviceType).toBe('babylon');
  });

  it('should provide capability description', async () => {
    const service = await BabylonClientService.start(runtime);
    expect(service.capabilityDescription).toContain('Babylon API client');
  });

  it('should stop service correctly', async () => {
    const service = await BabylonClientService.start(runtime);

    const runtimeWithService = createMockRuntime({
      getService: mock(() => service as any),
    });

    await BabylonClientService.stop(runtimeWithService);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should throw error when stopping non-existent service', async () => {
    const emptyRuntime = createMockRuntime({
      getService: mock(() => null),
    });

    await expect(BabylonClientService.stop(emptyRuntime)).rejects.toThrow(
      'BabylonClientService not found'
    );
  });

  it('should get client instance', async () => {
    const service = await BabylonClientService.start(runtime);
    const client = service.getClient();
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(BabylonApiClient);
  });

  it('should update auth token', async () => {
    const service = await BabylonClientService.start(runtime);
    const newToken = 'new-token-123';
    service.updateAuthToken(newToken);
    expect(logger.info).toHaveBeenCalled();
  });
});

describe('BabylonTradingService', () => {
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
  });

  it('should start the service', async () => {
    // Mock BabylonClientService
    const mockBabylonService = {
      getClient: () => ({
        getActiveMarkets: async () => [],
      }),
    };
    runtime.getService = mock((serviceType: string) => {
      if (serviceType === 'babylon') return mockBabylonService;
      return null;
    });

    const service = await BabylonTradingService.start(runtime);
    expect(service).toBeInstanceOf(BabylonTradingService);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should have correct service type', () => {
    expect(BabylonTradingService.serviceType).toBe('babylon_trading');
  });

  it('should stop service correctly', async () => {
    const mockBabylonService = {
      getClient: () => ({
        getActiveMarkets: async () => [],
      }),
    };
    runtime.getService = mock((serviceType: string) => {
      if (serviceType === 'babylon') return mockBabylonService;
      if (serviceType === 'babylon_trading') {
        return {
          stop: async () => {},
        };
      }
      return null;
    });

    const service = await BabylonTradingService.start(runtime);
    const runtimeWithService = createMockRuntime({
      getService: mock((serviceType: string) => {
        if (serviceType === 'babylon_trading') return service;
        return null;
      }),
    });

    await BabylonTradingService.stop(runtimeWithService);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should throw error when stopping non-existent service', async () => {
    const emptyRuntime = createMockRuntime({
      getService: mock(() => null),
    });

    await expect(BabylonTradingService.stop(emptyRuntime)).rejects.toThrow(
      'BabylonTradingService not found'
    );
  });

  it('should enable auto-trading', async () => {
    const mockBabylonService = {
      getClient: () => ({
        getActiveMarkets: async () => [],
      }),
    };
    runtime.getService = mock((serviceType: string) => {
      if (serviceType === 'babylon') return mockBabylonService;
      return null;
    });

    const service = await BabylonTradingService.start(runtime);
    service.enableAutoTrading();
    expect(logger.info).toHaveBeenCalled();
  });

  it('should disable auto-trading', async () => {
    const mockBabylonService = {
      getClient: () => ({
        getActiveMarkets: async () => [],
      }),
    };
    runtime.getService = mock((serviceType: string) => {
      if (serviceType === 'babylon') return mockBabylonService;
      return null;
    });

    const service = await BabylonTradingService.start(runtime);
    service.disableAutoTrading();
    expect(logger.info).toHaveBeenCalled();
  });
});

