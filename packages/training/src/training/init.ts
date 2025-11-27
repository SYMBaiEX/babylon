/**
 * Training System Initialization
 *
 * Call this on server startup to log configuration and verify setup
 */

import { isRLModelAvailable, logRLModelConfig } from './RLModelConfig';

export async function initializeTrainingSystem(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Initializing Training System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Log RL configuration
  logRLModelConfig();

  // Check if RL models are available
  const available = isRLModelAvailable();

  if (available) {
    console.log('\n✅ RL Model system available');
  } else {
    console.log('\nℹ️  RL models not available - using base model');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
