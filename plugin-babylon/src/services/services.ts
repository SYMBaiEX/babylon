/**
 * Babylon Game Services
 *
 * Services handle background operations and long-running integrations.
 * BabylonTradingService manages automated market monitoring and portfolio review.
 */

import { Service, type IAgentRuntime, type Memory, ServiceType } from '@elizaos/core';
import { BabylonApiClient } from '../api-client';
import type { MarketAnalysis } from '../types';

/**
 * Custom ServiceType for Babylon Trading
 * Since 'trading' is not in the official ServiceType enum,
 * we create a custom type that extends the enum
 */
export const BABYLON_TRADING_SERVICE = 'babylon_trading' as ServiceType;

/**
 * Babylon Trading Service
 *
 * Manages automated trading operations including:
 * - Market monitoring (every 60 seconds)
 * - Portfolio review (every 5 minutes)
 * - Automatic trade execution based on confidence thresholds
 */
export class BabylonTradingService extends Service {
  private marketMonitorInterval?: NodeJS.Timeout;
  private portfolioReviewInterval?: NodeJS.Timeout;
  private isAutoTrading: boolean = false;

  static get serviceType(): ServiceType {
    return BABYLON_TRADING_SERVICE;
  }

  /**
   * Static factory method to create and initialize the service
   * Follows ElizaOS service pattern
   */
  static async start(runtime: IAgentRuntime): Promise<BabylonTradingService> {
    const service = new BabylonTradingService();
    await service.initialize(runtime);
    return service;
  }

  /**
   * Initialize the trading service
   * Starts background monitoring loops
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    console.log('🚀 Initializing Babylon Trading Service...');

    const client = runtime.clients.babylonClient as BabylonApiClient;
    if (!client) {
      console.error('❌ Babylon client not available - service will not start');
      return;
    }

    // Check if auto-trading is enabled (preserve instance value if already set via enableAutoTrading)
    if (!this.isAutoTrading) {
      this.isAutoTrading = (runtime.character.settings as any)?.autoTrading === true;
    }

    if (!this.isAutoTrading) {
      console.log('ℹ️  Auto-trading disabled - service initialized but not active');
      return;
    }

    console.log('📊 Starting automated market monitoring...');

    // Start market monitoring loop (every 60 seconds)
    this.marketMonitorInterval = setInterval(async () => {
      try {
        await this.monitorMarkets(runtime);
      } catch (error) {
        console.error('Error in market monitoring:', error);
      }
    }, 60000);

    // Start portfolio review loop (every 5 minutes)
    this.portfolioReviewInterval = setInterval(async () => {
      try {
        await this.reviewPortfolio(runtime);
      } catch (error) {
        console.error('Error in portfolio review:', error);
      }
    }, 300000);

    console.log('✅ Babylon Trading Service initialized');
  }

  /**
   * Monitor markets and execute trades based on analysis
   */
  private async monitorMarkets(runtime: IAgentRuntime): Promise<void> {
    const client = runtime.clients.babylonClient as BabylonApiClient;

    console.log('📊 [' + new Date().toLocaleTimeString() + '] Checking markets...');

    try {
      // Create analysis message
      const analysisMessage: Memory = {
        userId: 'system' as any,
        agentId: runtime.agentId,
        roomId: 'babylon' as any,
        content: {
          text: 'analyze markets',
          source: 'auto',
        },
        createdAt: Date.now(),
      };

      // Use runtime.composeState to get full context with all providers
      const state = await runtime.composeState(analysisMessage, {
        minConfidence: (runtime.character.settings as any)?.minConfidence || 0.6,
      });

      // Trigger market analysis evaluator
      const evaluationResults = await runtime.evaluate(
        analysisMessage,
        state,
        false
      );

      // Check if we have analyses from evaluator
      const analyses = (state as any).analyses as MarketAnalysis[] | undefined;

      if (analyses && analyses.length > 0) {
        console.log(`   Found ${analyses.length} opportunities:`);

        for (const analysis of analyses) {
          console.log(`   📈 Market ${analysis.marketId}:`);
          console.log(`      Recommendation: ${analysis.recommendation.toUpperCase()}`);
          console.log(`      Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
          console.log(`      Side: ${analysis.targetSide.toUpperCase()}`);
          console.log(`      Reasoning: ${analysis.reasoning}`);

          // Execute trade if high confidence
          if (
            analysis.confidence >= 0.7 &&
            (analysis.recommendation === 'buy' || analysis.recommendation === 'strong_buy')
          ) {
            console.log(`   💰 Executing trade...`);

            const tradeMessage: Memory = {
              userId: 'system' as any,
              agentId: runtime.agentId,
              roomId: 'babylon' as any,
              content: {
                text: `buy ${analysis.targetSide} shares`,
                source: 'auto',
              },
              createdAt: Date.now(),
            };

            // Create state for trade action with market details
            const tradeState = await runtime.composeState(tradeMessage, {
              marketId: analysis.marketId,
              side: analysis.targetSide,
              amount: analysis.suggestedAmount,
            });

            // Trigger buy action
            await runtime.processActions(
              tradeMessage,
              [],
              tradeState,
              async (response) => {
                if (response.error) {
                  console.error(`   ❌ Trade failed: ${response.text}`);
                } else {
                  console.log(`   ✅ ${response.text}`);
                }
                return [];
              }
            );
          }
        }
      } else {
        console.log('   No trading opportunities found');
      }

      console.log('');
    } catch (error) {
      console.error('Error in market monitoring:', error);
    }
  }

  /**
   * Review portfolio performance and provide insights
   */
  private async reviewPortfolio(runtime: IAgentRuntime): Promise<void> {
    console.log('📊 [' + new Date().toLocaleTimeString() + '] Portfolio review...');

    try {
      const portfolioMessage: Memory = {
        userId: 'system' as any,
        agentId: runtime.agentId,
        roomId: 'babylon' as any,
        content: {
          text: 'review portfolio',
          source: 'auto',
        },
        createdAt: Date.now(),
      };

      // Use runtime.composeState to get full context with all providers
      const state = await runtime.composeState(portfolioMessage);

      // Trigger portfolio evaluator
      await runtime.evaluate(portfolioMessage, state, false);

      // Check if we have portfolio metrics from evaluator
      const portfolioMetrics = (state as any).portfolioMetrics;

      if (portfolioMetrics) {
        console.log(`   Total P&L: $${portfolioMetrics.totalPnL.toFixed(2)}`);
        console.log(`   Win Rate: ${(portfolioMetrics.winRate * 100).toFixed(1)}%`);
        console.log(`   Positions: ${portfolioMetrics.profitablePositions}W / ${portfolioMetrics.losingPositions}L`);

        const recommendations = (state as any).recommendations as string[] | undefined;
        if (recommendations && recommendations.length > 0) {
          console.log('   Recommendations:');
          recommendations.forEach((rec: string) => console.log(`      ${rec}`));
        }
      }

      console.log('');
    } catch (error) {
      console.error('Error in portfolio review:', error);
    }
  }

  /**
   * Enable auto-trading at runtime
   */
  enableAutoTrading(runtime: IAgentRuntime): void {
    if (this.isAutoTrading) {
      console.log('ℹ️  Auto-trading already enabled');
      return;
    }

    this.isAutoTrading = true;
    this.initialize(runtime);
  }

  /**
   * Disable auto-trading at runtime
   */
  disableAutoTrading(): void {
    if (!this.isAutoTrading) {
      console.log('ℹ️  Auto-trading already disabled');
      return;
    }

    this.isAutoTrading = false;
    this.stop();
  }

  /**
   * Stop the service and clean up intervals
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Babylon Trading Service...');

    if (this.marketMonitorInterval) {
      clearInterval(this.marketMonitorInterval);
      this.marketMonitorInterval = undefined;
    }

    if (this.portfolioReviewInterval) {
      clearInterval(this.portfolioReviewInterval);
      this.portfolioReviewInterval = undefined;
    }

    console.log('✅ Babylon Trading Service stopped');
  }
}
