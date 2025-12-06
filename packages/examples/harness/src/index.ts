/**
 * Agent Training Harness
 *
 * A framework for running and training agents with different archetypes.
 *
 * @example
 * ```typescript
 * import { runHarness, archetypeAgent, getArchetype } from '@babylon/agent-harness';
 *
 * const result = await runHarness({
 *   a2aUrl: 'http://localhost:3001',
 *   agents: [archetypeAgent],
 *   archetypes: [getArchetype('trader'), getArchetype('degen')],
 *   instancesPerAgent: 2,
 *   ticksPerAgent: 10,
 *   parallelAgents: 4,
 *   recordTrajectories: true,
 *   outputDir: './trajectories'
 * });
 * ```
 */

// A2A Clients
export { HarnessA2AClient } from './a2a-client';
export { ArchetypeAgent, archetypeAgent } from './agents/archetype-agent';
// Built-in Agents
export { RandomAgent, randomAgent } from './agents/random-agent';
// Archetypes
export {
  ARCHETYPES,
  getAllArchetypes,
  getArchetype,
  getArchetypeIds,
} from './archetypes';
// Core harness
export { AgentHarness, runHarness } from './harness';
export type {
  SimulationConfig,
  SimulationTickResult,
} from './offline-adapter';
// Simulation Adapter (uses engine directly, no server)
export { SimulationAdapter, OfflineGameAdapter } from './offline-adapter';
export type {
  GameState,
  SimulationEngineInterface,
} from './simulation-adapter';
export { SimulationA2AAdapter } from './simulation-adapter';
// Types
export type {
  A2AClientInterface,
  ActionResult,
  ActionType,
  AgentConfig,
  AgentContext,
  AgentDecision,
  ArchetypeConfig,
  ArchetypeTraits,
  HarnessConfig,
  HarnessResult,
  Market,
  Position,
  Post,
  Trade,
  TrainableAgent,
  Trajectory,
  TrajectoryStep,
} from './types';
