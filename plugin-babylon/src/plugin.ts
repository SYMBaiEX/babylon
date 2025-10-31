/**
 * @babylonai/plugin-babylon
 *
 * ElizaOS plugin for autonomous AI agents to participate in Babylon prediction markets
 * Following latest ElizaOS plugin architecture patterns
 *
 * Features:
 * - Real player interactions: Agents create accounts, manage wallets, place real bets
 * - Automated trading: Market monitoring, portfolio management, risk assessment
 * - Multiple strategies: Momentum, contrarian, volume-based trading
 * - Real-time data: Market prices, wallet balance, position tracking
 */

import type { Plugin } from '@elizaos/core';
import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  type Provider,
  Service,
  type State,
  type UUID,
  logger,
} from '@elizaos/core';
import { z } from 'zod';

// Import all components
import { BabylonApiClient } from './api-client';
import type { AgentConfig, BabylonMarket, MarketAnalysis, TradeRequest } from './types';

/**
 * Extended State interface for Babylon trading
 * Includes market data, analysis, and trade parameters
 */
interface BabylonState extends State {
  analyses?: MarketAnalysis[];
  markets?: BabylonMarket[];
  tradeRequest?: TradeRequest;
  marketId?: string;
  side?: 'yes' | 'no';
  amount?: number;
  portfolioMetrics?: {
    totalPnL: number;
    winRate: number;
    profitablePositions: number;
    losingPositions: number;
  };
  recommendations?: string[];
}

// Import actions, evaluators, providers, and services
import { buySharesAction, sellSharesAction, checkWalletAction } from './actions/actions';
import { marketAnalysisEvaluator, portfolioManagementEvaluator } from './evaluators/evaluators';
import {
  marketDataProvider,
  walletStatusProvider,
  positionSummaryProvider,
} from './providers/providers';
import { BabylonA2AService } from './a2a-service';

/**
 * Plugin configuration schema
 * Validates plugin parameters using Zod
 */
const configSchema = z.object({
  BABYLON_API_URL: z
    .string()
    .url()
    .optional()
    .default('http://localhost:3000')
    .transform((val) => {
      if (!val) {
        logger.warn('BABYLON_API_URL not provided, using default: http://localhost:3000');
      }
      return val;
    }),
  BABYLON_AGENT_ID: z.string().optional().default('babylon-agent-default'),
  BABYLON_AGENT_SECRET: z.string().optional(),
  BABYLON_MAX_TRADE_SIZE: z
    .string()
    .optional()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  BABYLON_MAX_POSITION_SIZE: z
    .string()
    .optional()
    .default('500')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  BABYLON_MIN_CONFIDENCE: z
    .string()
    .optional()
    .default('0.6')
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0).max(1)),
  BABYLON_A2A_ENDPOINT: z
    .string()
    .url()
    .optional()
    .default('ws://localhost:8080')
    .describe('A2A WebSocket server endpoint for real-time agent communication'),
  BABYLON_A2A_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
});

/**
 * Babylon Client Service
 *
 * Manages the BabylonApiClient instance following latest ElizaOS Service pattern.
 * Provides centralized access to Babylon prediction market API for all plugin components.
 */
export class BabylonClientService extends Service {
  static override serviceType = 'babylon' as const;

  override capabilityDescription =
    'Manages Babylon API client for prediction market interactions including market data, trading, wallet management, and position tracking';

  private client: BabylonApiClient;
  private clientConfig: AgentConfig;

  constructor(runtime: IAgentRuntime) {
    super(runtime);

    // Read configuration from runtime character settings
    const settings = (runtime.character.settings || {}) as Record<
      string,
      string | number | boolean | undefined
    >;

    this.clientConfig = {
      characterId: runtime.character.name || 'agent',
      apiBaseUrl:
        (typeof settings.babylonApiUrl === 'string' ? settings.babylonApiUrl : undefined) ||
        process.env.BABYLON_API_URL ||
        'http://localhost:3000',
      authToken:
        (typeof settings.babylonAuthToken === 'string'
          ? settings.babylonAuthToken
          : undefined) || process.env.BABYLON_AUTH_TOKEN,
      tradingLimits: {
        maxTradeSize:
          (typeof settings.babylonMaxTradeSize === 'number'
            ? settings.babylonMaxTradeSize
            : undefined) ||
          parseInt(process.env.BABYLON_MAX_TRADE_SIZE || '100'),
        maxPositionSize:
          (typeof settings.babylonMaxPositionSize === 'number'
            ? settings.babylonMaxPositionSize
            : undefined) || 500,
        minConfidence:
          (typeof settings.babylonMinConfidence === 'number'
            ? settings.babylonMinConfidence
            : undefined) || 0.6,
      },
    };

    this.client = new BabylonApiClient(this.clientConfig);

    this.runtime.logger.info(
      `BabylonClientService initialized: apiBaseUrl=${this.clientConfig.apiBaseUrl}, characterId=${this.clientConfig.characterId}, maxTradeSize=${this.clientConfig.tradingLimits?.maxTradeSize}`
    );
  }

  /**
   * Static factory method to create and start the service
   * Follows ElizaOS 1.6.3 Service pattern
   */
  static override async start(runtime: IAgentRuntime): Promise<BabylonClientService> {
    logger.info('Starting BabylonClientService');
    const service = new BabylonClientService(runtime);
    logger.info(
      `BabylonClientService configuration: apiBaseUrl=${service.clientConfig.apiBaseUrl}, characterId=${service.clientConfig.characterId}, hasAuthToken=${!!service.clientConfig.authToken}`
    );
    return service;
  }

  /**
   * Static stop method following ElizaOS pattern
   */
  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping BabylonClientService');
    const service = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);
    if (!service) {
      throw new Error('BabylonClientService not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  /**
   * Get the BabylonApiClient instance
   */
  getClient(): BabylonApiClient {
    return this.client;
  }

  /**
   * Get the current configuration
   */
  getConfig(): AgentConfig {
    return this.clientConfig;
  }

  /**
   * Update authentication token
   */
  updateAuthToken(token: string): void {
    this.clientConfig.authToken = token;
    // Recreate client with new token
    this.client = new BabylonApiClient(this.clientConfig);
    this.runtime.logger.info('BabylonClientService auth token updated');
  }

  /**
   * Cleanup resources when service stops
   */
  override async stop(): Promise<void> {
    this.runtime.logger.info('BabylonClientService stopping');
    // No active connections to close, but ready for future cleanup
  }
}

/**
 * Babylon Trading Service
 *
 * Manages automated trading operations including:
 * - Market monitoring (every 60 seconds)
 * - Portfolio review (every 5 minutes)
 * - Automatic trade execution based on confidence thresholds
 */
export class BabylonTradingService extends Service {
  static override serviceType = 'babylon_trading' as const;

  override capabilityDescription =
    'Automated prediction market trading with market monitoring, portfolio review, and confidence-based trade execution';

  private marketMonitorInterval?: NodeJS.Timeout;
  private portfolioReviewInterval?: NodeJS.Timeout;
  private isAutoTrading: boolean = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Static factory method to create and start the service
   * Follows latest ElizaOS Service pattern
   */
  static override async start(runtime: IAgentRuntime): Promise<BabylonTradingService> {
    logger.info('Starting BabylonTradingService');
    const service = new BabylonTradingService(runtime);
    await service.initialize();
    return service;
  }

  /**
   * Static stop method following ElizaOS pattern
   */
  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping BabylonTradingService');
    const service = runtime.getService<BabylonTradingService>(BabylonTradingService.serviceType);
    if (!service) {
      throw new Error('BabylonTradingService not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  /**
   * Initialize the trading service
   * Starts background monitoring loops
   */
  async initialize(): Promise<void> {
    this.runtime.logger.info('🚀 Initializing Babylon Trading Service...');

    // Get BabylonClientService
    const babylonService = this.runtime.getService<BabylonClientService>(BabylonClientService.serviceType);
    if (!babylonService) {
      this.runtime.logger.error(
        '❌ Babylon client service not available - service will not start'
      );
      return;
    }

    // Check if auto-trading is enabled
    if (!this.isAutoTrading) {
      const settings = (this.runtime.character.settings || {}) as Record<string, unknown>;
      this.isAutoTrading = settings.autoTrading === true;
    }

    if (!this.isAutoTrading) {
      this.runtime.logger.info('ℹ️  Auto-trading disabled - service initialized but not active');
      return;
    }

    this.runtime.logger.info('📊 Starting automated market monitoring...');

    // Start market monitoring loop (every 60 seconds)
    this.marketMonitorInterval = setInterval(async () => {
      try {
        await this.monitorMarkets();
      } catch (error) {
        this.runtime.logger.error(
          `Error in market monitoring: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }, 60000);

    // Start portfolio review loop (every 5 minutes)
    this.portfolioReviewInterval = setInterval(async () => {
      try {
        await this.reviewPortfolio();
      } catch (error) {
        this.runtime.logger.error(
          `Error in portfolio review: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }, 300000);

    this.runtime.logger.info('✅ Babylon Trading Service initialized');
  }

  /**
   * Monitor markets and execute trades based on analysis
   */
  private async monitorMarkets(): Promise<void> {
    this.runtime.logger.info(`📊 [${new Date().toLocaleTimeString()}] Checking markets...`);

    try {
      // Create analysis message
      const analysisMessage: Memory = {
        entityId: 'system' as UUID,
        agentId: this.runtime.agentId,
        roomId: 'babylon' as UUID,
        content: {
          text: 'analyze markets',
        },
        createdAt: Date.now(),
      };

      // Use runtime.composeState to get full context with all providers
      const state: BabylonState = await this.runtime.composeState(analysisMessage);

      // Trigger market analysis evaluator
      await this.runtime.evaluate(analysisMessage, state, false);

      // Check if we have analyses from evaluator
      const analyses = state.analyses;

      if (analyses && analyses.length > 0) {
        this.runtime.logger.info(`   Found ${analyses.length} opportunities:`);

        for (const analysis of analyses) {
          this.runtime.logger.info(`   📈 Market ${analysis.marketId}:`);
          this.runtime.logger.info(`      Recommendation: ${analysis.recommendation.toUpperCase()}`);
          this.runtime.logger.info(`      Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
          this.runtime.logger.info(`      Side: ${analysis.targetSide.toUpperCase()}`);
          this.runtime.logger.info(`      Reasoning: ${analysis.reasoning}`);

          // Execute trade if high confidence
          if (
            analysis.confidence >= 0.7 &&
            (analysis.recommendation === 'buy' || analysis.recommendation === 'strong_buy')
          ) {
            this.runtime.logger.info('   💰 Executing trade...');

            const tradeMessage: Memory = {
              entityId: 'system' as UUID,
              agentId: this.runtime.agentId,
              roomId: 'babylon' as UUID,
              content: {
                text: `buy ${analysis.targetSide} shares`,
              },
              createdAt: Date.now(),
            };

            // Create state for trade action with market details
            const tradeState: BabylonState = await this.runtime.composeState(tradeMessage);

            // Trigger buy action
            await this.runtime.processActions(
              tradeMessage,
              [],
              tradeState,
              async (response) => {
                if (response.error) {
                  this.runtime.logger.error(`   ❌ Trade failed: ${response.text}`);
                } else {
                  this.runtime.logger.info(`   ✅ ${response.text}`);
                }
                return [];
              }
            );
          }
        }
      } else {
        this.runtime.logger.info('   No trading opportunities found');
      }

      this.runtime.logger.info('');
    } catch (error) {
      this.runtime.logger.error(
        `Error in market monitoring: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Review portfolio performance and provide insights
   */
  private async reviewPortfolio(): Promise<void> {
    this.runtime.logger.info(`📊 [${new Date().toLocaleTimeString()}] Portfolio review...`);

    try {
      const portfolioMessage: Memory = {
        entityId: 'system' as UUID,
        agentId: this.runtime.agentId,
        roomId: 'babylon' as UUID,
        content: {
          text: 'review portfolio',
        },
        createdAt: Date.now(),
      };

      // Use runtime.composeState to get full context with all providers
      const state: BabylonState = await this.runtime.composeState(portfolioMessage);

      // Trigger portfolio evaluator
      await this.runtime.evaluate(portfolioMessage, state, false);

      // Check if we have portfolio metrics from evaluator
      const portfolioMetrics = state.portfolioMetrics;

      if (portfolioMetrics) {
        this.runtime.logger.info(`   Total P&L: $${portfolioMetrics.totalPnL.toFixed(2)}`);
        this.runtime.logger.info(`   Win Rate: ${(portfolioMetrics.winRate * 100).toFixed(1)}%`);
        this.runtime.logger.info(
          `   Positions: ${portfolioMetrics.profitablePositions}W / ${portfolioMetrics.losingPositions}L`
        );

        const recommendations = state.recommendations;
        if (recommendations && recommendations.length > 0) {
          this.runtime.logger.info('   Recommendations:');
          recommendations.forEach((rec: string) => this.runtime.logger.info(`      ${rec}`));
        }
      }

      this.runtime.logger.info('');
    } catch (error) {
      this.runtime.logger.error(
        `Error in portfolio review: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Enable auto-trading at runtime
   */
  enableAutoTrading(): void {
    if (this.isAutoTrading) {
      this.runtime.logger.info('ℹ️  Auto-trading already enabled');
      return;
    }

    this.isAutoTrading = true;
    this.initialize();
  }

  /**
   * Disable auto-trading at runtime
   */
  disableAutoTrading(): void {
    if (!this.isAutoTrading) {
      this.runtime.logger.info('ℹ️  Auto-trading already disabled');
      return;
    }

    this.isAutoTrading = false;
    this.stop();
  }

  /**
   * Stop the service and clean up intervals
   */
  override async stop(): Promise<void> {
    this.runtime.logger.info('🛑 Stopping Babylon Trading Service...');

    if (this.marketMonitorInterval) {
      clearInterval(this.marketMonitorInterval);
      this.marketMonitorInterval = undefined;
    }

    if (this.portfolioReviewInterval) {
      clearInterval(this.portfolioReviewInterval);
      this.portfolioReviewInterval = undefined;
    }

    this.runtime.logger.info('✅ Babylon Trading Service stopped');
  }
}

/**
 * Babylon Prediction Markets Plugin
 *
 * Enables Eliza agents to participate as real players in prediction markets with:
 * - 3 Actions: BUY_SHARES, SELL_SHARES, CHECK_WALLET
 * - 2 Evaluators: MARKET_ANALYSIS, PORTFOLIO_MANAGEMENT
 * - 3 Providers: Market data, wallet status, position summary
 * - 2 Services: API client management and automated trading
 *
 * @example
 * ```typescript
 * import { predictionMarketsPlugin } from '@babylonai/plugin-babylon';
 *
 * const runtime = new AgentRuntime({
 *   character,
 *   plugins: [predictionMarketsPlugin],
 *   // ...
 * });
 * ```
 */
export const predictionMarketsPlugin: Plugin = {
  name: 'babylon',
  description:
    'Participate in Babylon prediction markets with autonomous trading, portfolio management, and risk assessment',
  config: {
    BABYLON_API_URL: process.env.BABYLON_API_URL,
    BABYLON_AGENT_ID: process.env.BABYLON_AGENT_ID,
    BABYLON_AGENT_SECRET: process.env.BABYLON_AGENT_SECRET,
    BABYLON_MAX_TRADE_SIZE: process.env.BABYLON_MAX_TRADE_SIZE,
    BABYLON_MAX_POSITION_SIZE: process.env.BABYLON_MAX_POSITION_SIZE,
    BABYLON_MIN_CONFIDENCE: process.env.BABYLON_MIN_CONFIDENCE,
  },
  async init(config: Record<string, string>, runtime: IAgentRuntime): Promise<void> {
    logger.info('Initializing plugin-babylon');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== undefined && value !== null) {
          process.env[key] = String(value);
        }
      }

      // Log initialization with runtime context
      logger.info(`Babylon plugin initialized for agent: ${runtime.agentId || 'unknown'}`);

      // Initialize A2A service if enabled
      if (validatedConfig.BABYLON_A2A_ENABLED && validatedConfig.BABYLON_A2A_ENDPOINT) {
        const a2aService = new BabylonA2AService({
          endpoint: validatedConfig.BABYLON_A2A_ENDPOINT,
          enabled: validatedConfig.BABYLON_A2A_ENABLED,
        });
        await a2aService.initialize(runtime);
        // Add service to runtime services Map (using type assertion for custom service)
        runtime.services.set(BabylonA2AService.serviceType as any, [a2aService]);
        logger.info(`A2A service initialized: ${validatedConfig.BABYLON_A2A_ENDPOINT}`);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages =
          error.issues?.map((e) => e.message)?.join(', ') || 'Unknown validation error';
        throw new Error(`Invalid plugin configuration: ${errorMessages}`);
      }
      throw new Error(
        `Invalid plugin configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  services: [BabylonClientService, BabylonTradingService],
  actions: [buySharesAction, sellSharesAction, checkWalletAction],
  evaluators: [marketAnalysisEvaluator, portfolioManagementEvaluator] as Evaluator[],
  providers: [marketDataProvider, walletStatusProvider, positionSummaryProvider] as Provider[],
};

export default predictionMarketsPlugin;

