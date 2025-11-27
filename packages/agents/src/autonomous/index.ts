/**
 * Autonomous Agent Services
 * Centralized exports for all autonomous behaviors
 */

// Individual services (for specific use cases)
export { autonomousA2AService } from './AutonomousA2AService';
export { autonomousBatchResponseService } from './AutonomousBatchResponseService';
export { autonomousCommentingService } from './AutonomousCommentingService';
// Main coordinator (use this for all autonomous operations)
// Now includes optional trajectory recording via recordTrajectories parameter
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
