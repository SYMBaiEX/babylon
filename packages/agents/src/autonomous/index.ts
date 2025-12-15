/**
 * Autonomous Agent Services
 *
 * Centralized exports for all autonomous agent behaviors including trading,
 * posting, commenting, messaging, and batch response processing.
 *
 * @packageDocumentation
 */

export { autonomousA2AService } from './AutonomousA2AService';
export { autonomousBatchResponseService } from './AutonomousBatchResponseService';
export { autonomousCommentingService } from './AutonomousCommentingService';
export {
  AutonomousCoordinator,
  type AutonomousTickResult,
  autonomousCoordinator,
} from './AutonomousCoordinator';
export { autonomousDMService } from './AutonomousDMService';
export { autonomousGroupChatService } from './AutonomousGroupChatService';
export {
  autonomousPlanningCoordinator,
  type PlannedAction,
} from './AutonomousPlanningCoordinator';
export { autonomousPostingService } from './AutonomousPostingService';
export { autonomousTradingService } from './AutonomousTradingService';
export {
  type DirectCommentParams,
  type DirectCommentResult,
  type DirectPostParams,
  type DirectPostResult,
  type DirectTradeParams,
  type DirectTradeResult,
  executeDirectComment,
  executeDirectPost,
  executeDirectTrade,
} from './DirectExecutors';
export {
  MultiStepExecutor,
  type MultiStepExecutorResult,
  multiStepExecutor,
} from './MultiStepExecutor';

// Multi-step decision templates
export {
  type ActionTraceResult,
  type AgentTickContext,
  buildMultiStepDecisionPrompt,
  buildMultiStepSummaryPrompt,
  type MultiStepDecision,
  type PendingInteraction,
  type PerpMarketContext,
  type PostContext,
  type PredictionMarketContext,
} from './templates/multi-step-decision';
