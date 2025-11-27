/**
 * A2A Protocol Exports
 *
 * Babylon implements the official A2A protocol using @a2a-js/sdk
 * All A2A operations use the standard message/send, tasks/get, etc. methods
 *
 * Endpoint: /api/a2a
 *
 * For client usage, use A2AClient from @a2a-js/sdk/client
 * See examples/a2a-agent0/ for usage examples
 */

// A2A Protocol Implementation (using @a2a-js/sdk)
export { babylonAgentCard } from './babylon-agent-card';

// Blockchain integration
export * from './blockchain';

// Executor
export {
  BabylonAgentExecutor,
  BabylonAgentExecutor as BabylonExecutor,
} from './executors/babylon-executor';

// Task store
export type { ListTasksParams, ListTasksResult } from './extended-task-store';
export { ExtendedTaskStore } from './extended-task-store';

// Handlers (escrow operations)
export * from './handlers/escrow-handlers';

// Payment handling
export * from './payments';

// Agent card generator for per-agent cards
export {
  generateAgentCard,
  generateAgentCardSync,
} from './sdk/agent-card-generator';

// Services
export * from './services';

// Shared utilities (logger, snowflake, types)
// Note: Don't export types from ./shared to avoid duplicates with @babylon/shared
export * from './shared/types';

// Types
export * from './types';

// Utilities (auth, rate limiting)
export * from './utils';

// Validation schemas
export * from './validation';

// Note: For client usage, use A2AClient from @a2a-js/sdk/client
// See examples/a2a-agent0/ for usage examples
