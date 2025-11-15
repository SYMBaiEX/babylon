/**
 * Babylon Plugin Integration Service - Official A2A SDK
 * 
 * Integrates the Babylon A2A plugin with the agent runtime manager
 * using the official @a2a-js/sdk
 * 
 * This file re-exports the official SDK implementation to maintain
 * backward compatibility with existing code.
 */

// Re-export from official SDK integration
export {
  initializeAgentA2AClient,
  enhanceRuntimeWithBabylon,
  disconnectAgentA2AClient,
  hasActiveA2AConnection,
  BabylonA2AClientWrapper,
  initializeAgentA2AClientOfficial
} from './integration-official-sdk-complete'

