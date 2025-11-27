/**
 * Trading Fee Configuration
 *
 * @description Centralized fee configuration for all trading activities.
 * Defines trading fee rates, fee distribution, minimum fees, and fee types
 * for prediction markets and perpetual futures.
 */

/**
 * Fee configuration constants
 *
 * @description Contains all fee-related configuration including rates,
 * distribution shares, minimum amounts, and fee type identifiers.
 */
export const FEE_CONFIG = {
  // Trading fees
  TRADING_FEE_RATE: 0.001, // 0.1% on all trades

  // Fee distribution
  PLATFORM_SHARE: 0.5, // 50% to platform
  REFERRER_SHARE: 0.5, // 50% to referrer (if they have one)

  // Minimum fees
  MIN_FEE_AMOUNT: 0.01, // Don't process fees < $0.01

  // Fee types
  FEE_TYPES: {
    PRED_BUY: 'pred_buy',
    PRED_SELL: 'pred_sell',
    PERP_OPEN: 'perp_open',
    PERP_CLOSE: 'perp_close',
  } as const,

  // Balance transaction types for fees
  TRANSACTION_TYPES: {
    TRADING_FEE: 'trading_fee',
    REFERRAL_FEE_EARNED: 'referral_fee_earned',
  } as const,
} as const;

/**
 * Fee type identifier
 *
 * @description Type representing valid fee types for trading operations.
 */
export type FeeType =
  (typeof FEE_CONFIG.FEE_TYPES)[keyof typeof FEE_CONFIG.FEE_TYPES];

/**
 * Fee transaction type identifier
 *
 * @description Type representing valid balance transaction types for fees.
 */
export type FeeTransactionType =
  (typeof FEE_CONFIG.TRANSACTION_TYPES)[keyof typeof FEE_CONFIG.TRANSACTION_TYPES];
