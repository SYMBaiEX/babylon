/**
 * Reputation Module
 *
 * Exports all reputation-related services and utilities.
 */

// PNL Normalization utilities
export {
  normalizePnL,
  denormalizePnL,
  calculateWinRate,
  calculateAverageROI,
  calculateSharpeRatio,
  getTrustLevel,
  calculateConfidenceScore,
} from './pnl-normalizer';

// Reputation Calculation Service
export {
  calculateReputationScore,
  updateGameMetrics,
  updateTradingMetrics,
  updateFeedbackMetrics,
  recalculateReputation,
  getReputationBreakdown,
  getReputationLeaderboard,
  calculateGameScore,
  calculateTradeScore,
  generateGameCompletionFeedback,
  generateTradeCompletionFeedback,
  generateBatchGameFeedback,
  type ReputationScoreBreakdown,
  type GameMetrics,
  type TradeMetrics,
} from './reputation-calculation-service';

// Trade Feedback Calculator
export {
  calculateEntryTimingScore,
  calculateExitTimingScore,
  calculateRiskScore,
  calculateTradeMetrics,
  getTradeFeedbackSummary,
} from './trade-feedback-calculator';

