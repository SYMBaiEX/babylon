/**
 * Babylon Game Providers
 *
 * Providers supply real-time data and context to the agent runtime.
 * They are called automatically by runtime.composeState() to inject
 * current market conditions, wallet status, and position data into
 * every agent decision.
 */

import type { Provider, IAgentRuntime, Memory, State } from '@ai16z/eliza';
import { BabylonApiClient } from '../api-client';

/**
 * Market Data Provider
 *
 * Aggregates active market information to give agent awareness of:
 * - Total number of active markets
 * - Highest volume markets
 * - Market opportunities
 */
export const marketDataProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    try {
      const client = runtime.clients.babylonClient as BabylonApiClient;
      if (!client) {
        return 'Market data unavailable - client not configured';
      }

      const markets = await client.getActiveMarkets();

      if (markets.length === 0) {
        return 'No active markets currently available';
      }

      // Sort by volume to identify hottest markets
      const sortedMarkets = markets.sort((a, b) => b.totalVolume - a.totalVolume);
      const topMarket = sortedMarkets[0];
      const highVolumeMarkets = sortedMarkets.filter(m => m.totalVolume > 1000);

      return `📊 Market Overview:
- Active Markets: ${markets.length}
- Top Volume: "${topMarket.question}" ($${topMarket.totalVolume.toFixed(0)})
- High Volume Markets (>$1000): ${highVolumeMarkets.length}
- Average Yes Price: ${(markets.reduce((sum, m) => sum + m.yesPrice, 0) / markets.length * 100).toFixed(1)}%`;
    } catch (error) {
      console.error('Error in marketDataProvider:', error);
      return 'Market data temporarily unavailable';
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
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    try {
      const client = runtime.clients.babylonClient as BabylonApiClient;
      if (!client) {
        return 'Wallet status unavailable - client not configured';
      }

      const wallet = await client.getWallet();

      if (!wallet) {
        return 'Wallet information unavailable - not authenticated';
      }

      const utilizationRate = wallet.balance > 0
        ? ((wallet.lockedBalance / wallet.balance) * 100).toFixed(1)
        : '0.0';

      return `💰 Wallet Status:
- Available Balance: $${wallet.availableBalance.toFixed(2)}
- Locked in Positions: $${wallet.lockedBalance.toFixed(2)}
- Total Balance: $${wallet.balance.toFixed(2)}
- Capital Utilization: ${utilizationRate}%`;
    } catch (error) {
      console.error('Error in walletStatusProvider:', error);
      return 'Wallet status temporarily unavailable';
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
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    try {
      const client = runtime.clients.babylonClient as BabylonApiClient;
      if (!client) {
        return 'Position data unavailable - client not configured';
      }

      const positions = await client.getPositions();

      if (positions.length === 0) {
        return '📈 Positions: No active positions';
      }

      const profitablePositions = positions.filter(p => p.pnl > 0);
      const losingPositions = positions.filter(p => p.pnl < 0);
      const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
      const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
      const winRate = (profitablePositions.length / positions.length * 100).toFixed(1);

      return `📈 Position Summary:
- Active Positions: ${positions.length}
- Profitable: ${profitablePositions.length} | Losing: ${losingPositions.length}
- Win Rate: ${winRate}%
- Total P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}
- Position Value: $${totalValue.toFixed(2)}`;
    } catch (error) {
      console.error('Error in positionSummaryProvider:', error);
      return 'Position data temporarily unavailable';
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
