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
  MultiStepExecutor,
  multiStepExecutor,
  type MultiStepExecutorResult,
} from './MultiStepExecutor';
export {
  autonomousPlanningCoordinator,
  type PlannedAction,
} from './AutonomousPlanningCoordinator';
export { autonomousPostingService } from './AutonomousPostingService';
export { autonomousTradingService } from './AutonomousTradingService';

// Multi-step decision templates
export {
  type ActionTraceResult,
  type AgentTickContext,
  type MultiStepDecision,
  buildMultiStepDecisionPrompt,
  buildMultiStepSummaryPrompt,
} from './templates/multi-step-decision';
