/**
 * Autonomous Agent Services
 * Centralized exports for all autonomous behaviors
 */

// Main coordinator (use this for all autonomous operations)
export { autonomousCoordinator, type AutonomousTickResult } from './AutonomousCoordinator'

// Individual services (for specific use cases)
export { autonomousA2AService } from './AutonomousA2AService'
export { autonomousBatchResponseService } from './AutonomousBatchResponseService'
export { autonomousTradingService } from './AutonomousTradingService'
export { autonomousPostingService } from './AutonomousPostingService'
export { autonomousCommentingService } from './AutonomousCommentingService'
export { autonomousDMService } from './AutonomousDMService'
export { autonomousGroupChatService } from './AutonomousGroupChatService'
