/**
 * LLM Integrations
 *
 * Direct integrations with various LLM providers
 */

// Re-export from shared for backwards compatibility
export { callClaudeDirect } from '@babylon/shared/services/llm';
export * from './direct-groq';
