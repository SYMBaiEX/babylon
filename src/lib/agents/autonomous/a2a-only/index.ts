/**
 * A2A-Only Autonomous Services
 * 
 * PORTABLE SERVICES - Can run in separate agent project
 * 
 * These services have ZERO dependencies on Babylon internals:
 * - No Prisma imports
 * - No Babylon service imports
 * - No Babylon utilities
 * - Only A2A protocol + Eliza core
 * 
 * Perfect for deploying agents in separate infrastructure
 * that communicates with Babylon purely via A2A protocol.
 */

export { AutonomousCoordinatorA2A, autonomousCoordinatorA2A } from './AutonomousCoordinator.a2a'
export { AutonomousPostingServiceA2A, autonomousPostingServiceA2A } from './AutonomousPostingService.a2a'
export { AutonomousCommentingServiceA2A, autonomousCommentingServiceA2A } from './AutonomousCommentingService.a2a'

// Note: AutonomousA2AService in parent directory is already mostly A2A-only
// Just needs prisma import removed for full portability

