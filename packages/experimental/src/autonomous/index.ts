/**
 * Autonomous Module
 *
 * Self-contained autonomous game runner with verification tools.
 */

export {
  type AutonomousConfig,
  AutonomousRunner,
  type RunnerStats,
} from './runner.js';
export {
  type AttestationVerification,
  checkTakeoverCapability,
  formatOnChainVerification,
  formatPermissionlessCheck,
  formatVerification,
  type OnChainVerification,
  type PermissionlessCheck,
  type TakeoverCapability,
  verifyAttestation,
  verifyOnChainState,
  verifyPermissionless,
} from './verifier.js';
