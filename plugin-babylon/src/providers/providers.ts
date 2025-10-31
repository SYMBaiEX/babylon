/**
 * Babylon Game Providers
 *
 * Providers supply real-time data and context to the agent runtime.
 * They are called automatically by runtime.composeState() to inject
 * current market conditions, wallet status, and position data into
 * every agent decision.
 */

import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from '@elizaos/core';
import type { BabylonClientService } from '../services/services';

/**
 * Market Data Provider
 *
 * Aggregates active market information to give agent awareness of:
 * - Total number of active markets
 * - Highest volume markets
 * - Market opportunities
 */
export const marketDataProvider: Provider = {
  name: 'marketDataProvider',
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    try {
      // Get client from BabylonClientService
      const babylonService = runtime.getService<BabylonClientService>('babylon');
      if (!babylonService) {
        return {
          text: 'Market data unavailable - Babylon service not configured'
        };
      }

      const client = babylonService.getClient();
      const markets = await client.getActiveMarkets();

      if (markets.length === 0) {
        return {
          text: 'No active markets currently available'
        };
      }

      // Sort by volume to identify hottest markets
      const sortedMarkets = markets.sort((a, b) => b.totalVolume - a.totalVolume);
      const topMarket = sortedMarkets[0];
      const highVolumeMarkets = sortedMarkets.filter(m => m.totalVolume > 1000);

      return {
        text: `📊 Market Overview:
- Active Markets: ${markets.length}
- Top Volume: "${topMarket.question}" ($${topMarket.totalVolume.toFixed(0)})
- High Volume Markets (>$1000): ${highVolumeMarkets.length}
- Average Yes Price: ${(markets.reduce((sum, m) => sum + m.yesPrice, 0) / markets.length * 100).toFixed(1)}%`,
        data: {
          markets,
          topMarket,
          highVolumeMarkets
        }
      };
    } catch (error) {
      runtime.logger.error('Error in marketDataProvider:', error instanceof Error ? error.message : String(error));
      return {
        text: 'Market data temporarily unavailable'
      };
    }
  },
};

/**
 * Wallet Status Provider
 *
 * Injects current wallet balance information into agent context.
 * Essential for making informed trading decisions based on available funds.
 */
export const walletStatusProvider: Provider = {
  name: 'walletStatusProvider',
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    try {
      const babylonService = runtime.getService<BabylonClientService>('babylon');
      if (!babylonService) {
        return {
          text: 'Wallet status unavailable - Babylon service not configured'
        };
      }

      const client = babylonService.getClient();
      const wallet = await client.getWallet();

      if (!wallet) {
        return {
          text: 'Wallet information unavailable - not authenticated'
        };
      }

      const utilizationRate = wallet.balance > 0
        ? ((wallet.lockedBalance / wallet.balance) * 100).toFixed(1)
        : '0.0';

      return {
        text: `💰 Wallet Status:
- Available Balance: $${wallet.availableBalance.toFixed(2)}
- Locked in Positions: $${wallet.lockedBalance.toFixed(2)}
- Total Balance: $${wallet.balance.toFixed(2)}
- Capital Utilization: ${utilizationRate}%`,
        data: { wallet }
      };
    } catch (error) {
      runtime.logger.error('Error in walletStatusProvider:', error instanceof Error ? error.message : String(error));
      return {
        text: 'Wallet status temporarily unavailable'
      };
    }
  },
};

/**
 * Position Summary Provider
 *
 * Provides overview of current trading positions including:
 * - Total positions
 * - Profitable vs losing positions
 * - Overall P&L
 * - Performance metrics
 */
export const positionSummaryProvider: Provider = {
  name: 'positionSummaryProvider',
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    try {
      const babylonService = runtime.getService<BabylonClientService>('babylon');
      if (!babylonService) {
        return {
          text: 'Position data unavailable - Babylon service not configured'
        };
      }

      const client = babylonService.getClient();
      const positions = await client.getPositions();

      if (positions.length === 0) {
        return {
          text: '📈 Positions: No active positions'
        };
      }

      const profitablePositions = positions.filter(p => p.pnl > 0);
      const losingPositions = positions.filter(p => p.pnl < 0);
      const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
      const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
      const winRate = (profitablePositions.length / positions.length * 100).toFixed(1);

      return {
        text: `📈 Position Summary:
- Active Positions: ${positions.length}
- Profitable: ${profitablePositions.length} | Losing: ${losingPositions.length}
- Win Rate: ${winRate}%
- Total P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}
- Position Value: $${totalValue.toFixed(2)}`,
        data: {
          positions,
          profitablePositions,
          losingPositions,
          totalPnL,
          totalValue,
          winRate: parseFloat(winRate)
        }
      };
    } catch (error) {
      runtime.logger.error('Error in positionSummaryProvider:', error instanceof Error ? error.message : String(error));
      return {
        text: 'Position data temporarily unavailable'
      };
    }
  },
};

/**
 * Export all providers for plugin registration
 */
export const babylonGameProviders: Provider[] = [
  marketDataProvider,
  walletStatusProvider,
  positionSummaryProvider,
];
