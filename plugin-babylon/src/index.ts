/**
 * @babylonai/plugin-babylon
 *
 * ElizaOS plugin for autonomous AI agents to participate in Babylon prediction markets
 *
 * Features:
 * - Real player interactions: Agents create accounts, manage wallets, place real bets
 * - Automated trading: Market monitoring, portfolio management, risk assessment
 * - Multiple strategies: Momentum, contrarian, volume-based trading
 * - Real-time data: Market prices, wallet balance, position tracking
 *
 * @module @babylonai/plugin-babylon
 */

import type { Plugin } from '@elizaos/core';
import { BabylonApiClient } from './api-client';
import { babylonGameActions } from './actions/actions';
import { babylonGameEvaluators } from './evaluators/evaluators';
import { babylonGameProviders } from './providers/providers';
import { BabylonClientService, BabylonTradingService } from './services/services';
import type { AgentConfig } from './types';

// Export all components
export * from './types';
export * from './api-client';
export * from './agent-auth-service';
export * from './actions/actions';
export * from './evaluators/evaluators';
export * from './providers/providers';
export * from './services/services';
export * from './environment';

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
  description: 'Participate in Babylon prediction markets with autonomous trading, portfolio management, and risk assessment',
  actions: babylonGameActions,
  evaluators: babylonGameEvaluators,
  providers: babylonGameProviders,
  services: [BabylonClientService, BabylonTradingService],
};

/**
 * Legacy export for backward compatibility
 * @deprecated Use predictionMarketsPlugin instead
 */
export const babylonGamePlugin = predictionMarketsPlugin;

/**
 * Create Babylon API Client
 *
 * @deprecated BabylonClientService now manages the API client automatically.
 * The service is registered when the plugin loads and handles client lifecycle.
 *
 * Factory function to create an authenticated API client instance.
 * For direct API access outside of the plugin, create a client instance directly:
 *
 * @param config - Agent configuration including API URL, auth, and trading limits
 * @returns Configured BabylonApiClient instance
 *
 * @example
 * ```typescript
 * // Preferred: Use BabylonClientService (automatic)
 * const runtime = new AgentRuntime({
 *   character,
 *   plugins: [predictionMarketsPlugin],
 * });
 * // Access via: runtime.getService<BabylonClientService>('babylon')
 *
 * // Legacy: Direct client creation (for external use only)
 * const client = createBabylonClient({
 *   characterId: 'alice',
 *   apiBaseUrl: 'http://localhost:3000',
 *   tradingLimits: {
 *     maxTradeSize: 100,
 *     maxPositionSize: 500,
 *     minConfidence: 0.6
 *   }
 * });
 * ```
 */
export function createBabylonClient(config: AgentConfig): BabylonApiClient {
  return new BabylonApiClient(config);
}

// Default export
export default predictionMarketsPlugin;
