/**
 * Babylon Game Services
 *
 * Services handle background operations and long-running integrations.
 * - BabylonClientService: Manages the Babylon API client instance
 * - BabylonTradingService: Manages automated market monitoring and portfolio review
 */

import { Service, type IAgentRuntime, type Memory, type UUID } from '@elizaos/core';
import { BabylonApiClient } from '../api-client';
import type { MarketAnalysis, AgentConfig } from '../types';

/**
 * Babylon Client Service
 *
 * Manages the BabylonApiClient instance following ElizaOS 1.6.3 Service pattern.
 * Provides centralized access to Babylon prediction market API for all plugin components.
 */
export class BabylonClientService extends Service {
  static serviceType = 'babylon' as const;

  capabilityDescription = 'Manages Babylon API client for prediction market interactions including market data, trading, wallet management, and position tracking';

  private client: BabylonApiClient;
  private clientConfig: AgentConfig;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Read configuration from runtime character settings
    const settings = (runtime.character.settings || {}) as Record<string, string | number | boolean | undefined>;

    this.clientConfig = {
      characterId: runtime.character.name || 'agent',
      apiBaseUrl: (typeof settings.babylonApiUrl === 'string' ? settings.babylonApiUrl : undefined) || process.env.BABYLON_API_URL || 'http://localhost:3000',
      authToken: (typeof settings.babylonAuthToken === 'string' ? settings.babylonAuthToken : undefined) || process.env.BABYLON_AUTH_TOKEN,
      tradingLimits: {
        maxTradeSize: (typeof settings.babylonMaxTradeSize === 'number' ? settings.babylonMaxTradeSize : undefined) || parseInt(process.env.BABYLON_MAX_TRADE_SIZE || '100'),
        maxPositionSize: (typeof settings.babylonMaxPositionSize === 'number' ? settings.babylonMaxPositionSize : undefined) || 500,
        minConfidence: (typeof settings.babylonMinConfidence === 'number' ? settings.babylonMinConfidence : undefined) || 0.6,
      },
    };

    this.client = new BabylonApiClient(this.clientConfig);

    this.runtime.logger.info(
      `BabylonClientService initialized: apiBaseUrl=${this.clientConfig.apiBaseUrl}, characterId=${this.clientConfig.characterId}, maxTradeSize=${this.clientConfig.tradingLimits?.maxTradeSize}`
    );
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
  async stop(): Promise<void> {
    this.runtime.logger.info('BabylonClientService stopping');
    // No active connections to close, but ready for future cleanup
  }

  /**
   * Initialize and start the service
   */
  static async start(runtime: IAgentRuntime): Promise<BabylonClientService> {
    runtime.logger.info('Starting BabylonClientService');

    const service = new BabylonClientService(runtime);

    runtime.logger.info(
      `BabylonClientService configuration: apiBaseUrl=${service.clientConfig.apiBaseUrl}, characterId=${service.clientConfig.characterId}, hasAuthToken=${!!service.clientConfig.authToken}`
    );

    return service;
  }
}

/**
 * Custom service type string for Babylon Trading
 */
export const BABYLON_TRADING_SERVICE = 'babylon_trading' as const;

/**
 * Babylon Trading Service
 *
 * Manages automated trading operations including:
 * - Market monitoring (every 60 seconds)
 * - Portfolio review (every 5 minutes)
 * - Automatic trade execution based on confidence thresholds
 */
export class BabylonTradingService extends Service {
  static serviceType = BABYLON_TRADING_SERVICE;

  capabilityDescription = 'Automated prediction market trading with market monitoring, portfolio review, and confidence-based trade execution';

  private marketMonitorInterval?: NodeJS.Timeout;
  private portfolioReviewInterval?: NodeJS.Timeout;
  private isAutoTrading: boolean = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Static factory method to create and initialize the service
   * Follows ElizaOS service pattern
   */
  static async start(runtime: IAgentRuntime): Promise<BabylonTradingService> {
    const service = new BabylonTradingService(runtime);
    await service.initialize();
    return service;
  }

  /**
   * Initialize the trading service
   * Starts background monitoring loops
   */
  async initialize(): Promise<void> {
    this.runtime.logger.info('🚀 Initializing Babylon Trading Service...');

    // Get BabylonClientService
    const babylonService = this.runtime.getService<BabylonClientService>('babylon');
    if (!babylonService) {
      this.runtime.logger.error('❌ Babylon client service not available - service will not start');
      return;
    }

    // Check if auto-trading is enabled (preserve instance value if already set via enableAutoTrading)
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
        this.runtime.logger.error(`Error in market monitoring: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 60000);

    // Start portfolio review loop (every 5 minutes)
    this.portfolioReviewInterval = setInterval(async () => {
      try {
        await this.reviewPortfolio();
      } catch (error) {
        this.runtime.logger.error(`Error in portfolio review: ${error instanceof Error ? error.message : String(error)}`);
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
      const state = await this.runtime.composeState(analysisMessage);

      // Trigger market analysis evaluator
      const evaluationResults = await this.runtime.evaluate(
        analysisMessage,
        state,
        false
      );

      // Log evaluation results for debugging
      if (!evaluationResults || evaluationResults.length === 0) {
        this.runtime.logger.warn('   No evaluators triggered for market analysis');
      }

      // Check if we have analyses from evaluator
      const analyses = (state as any).analyses as MarketAnalysis[] | undefined;

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
            const tradeState = await this.runtime.composeState(tradeMessage);

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
      this.runtime.logger.error(`Error in market monitoring: ${error instanceof Error ? error.message : String(error)}`);
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
      const state = await this.runtime.composeState(portfolioMessage);

      // Trigger portfolio evaluator
      await this.runtime.evaluate(portfolioMessage, state, false);

      // Check if we have portfolio metrics from evaluator
      const portfolioMetrics = (state as any).portfolioMetrics;

      if (portfolioMetrics) {
        this.runtime.logger.info(`   Total P&L: $${portfolioMetrics.totalPnL.toFixed(2)}`);
        this.runtime.logger.info(`   Win Rate: ${(portfolioMetrics.winRate * 100).toFixed(1)}%`);
        this.runtime.logger.info(`   Positions: ${portfolioMetrics.profitablePositions}W / ${portfolioMetrics.losingPositions}L`);

        const recommendations = (state as any).recommendations as string[] | undefined;
        if (recommendations && recommendations.length > 0) {
          this.runtime.logger.info('   Recommendations:');
          recommendations.forEach((rec: string) => this.runtime.logger.info(`      ${rec}`));
        }
      }

      this.runtime.logger.info('');
    } catch (error) {
      this.runtime.logger.error(`Error in portfolio review: ${error instanceof Error ? error.message : String(error)}`);
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
  async stop(): Promise<void> {
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
