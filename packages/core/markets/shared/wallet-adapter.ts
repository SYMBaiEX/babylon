import type { WalletPort } from './common';
import { WalletService } from '@babylon/engine';

/**
 * Adapter to bridge WalletService to WalletPort shape.
 */
export const WalletPortAdapter: WalletPort = {
  async debit({ userId, amount, reason, description, relatedId }) {
    await WalletService.debit(userId, amount, reason, description ?? '', relatedId);
  },
  async credit({ userId, amount, reason, description, relatedId }) {
    await WalletService.credit(userId, amount, reason, description ?? '', relatedId);
  },
  async recordPnL({ userId, pnl, reason, relatedId }) {
    await WalletService.recordPnL(userId, pnl, reason, relatedId);
  },
  async getBalance(userId: string) {
    return WalletService.getBalance(userId);
  },
};
