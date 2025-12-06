/**
 * Synthetic Data Detector
 *
 * CRITICAL: This module detects and rejects synthetic/fake data.
 * Only real agent trajectories from production should be used for training.
 *
 * Synthetic data patterns:
 * - agent-trader-123 style IDs (from test generators)
 * - synthetic-0, synthetic-1 style IDs
 * - fake-* prefixed IDs
 * - test-agent-* prefixed IDs
 */

import { logger } from './logger';

// Patterns that indicate synthetic/fake agent IDs - REJECT THESE
const SYNTHETIC_AGENT_PATTERNS = [
  /^agent-[a-z]+-\d+$/, // agent-trader-123
  /^synthetic-\d+$/, // synthetic-0, synthetic-1
  /^fake-/, // fake-anything
  /^test-agent-/, // test-agent-*
  /^mock-/, // mock-*
  /^dummy-/, // dummy-*
];

// Patterns that indicate synthetic scenario IDs
const SYNTHETIC_SCENARIO_PATTERNS = [
  /^multi-archetype/, // multi-archetype scenarios
  /^synthetic-/, // synthetic scenarios
  /^test-/, // test scenarios
  /^benchmark-/, // benchmark scenarios (for eval only, not training)
];

/**
 * Check if an agent ID looks synthetic/fake.
 *
 * @returns true if the agent ID appears to be synthetic and should be REJECTED.
 */
export function isSyntheticAgentId(agentId: string): boolean {
  return SYNTHETIC_AGENT_PATTERNS.some((pattern) => pattern.test(agentId));
}

/**
 * Check if a scenario ID looks synthetic/fake.
 *
 * @returns true if the scenario ID appears to be synthetic and should be REJECTED.
 */
export function isSyntheticScenarioId(scenarioId: string | null): boolean {
  if (!scenarioId) return false;
  return SYNTHETIC_SCENARIO_PATTERNS.some((pattern) => pattern.test(scenarioId));
}

/**
 * Check if a trajectory is synthetic/fake data.
 *
 * @returns true if the trajectory appears to be synthetic and should be REJECTED.
 * We only want real agent data for training.
 */
export function isSyntheticTrajectory(
  agentId: string,
  scenarioId: string | null
): boolean {
  return isSyntheticAgentId(agentId) || isSyntheticScenarioId(scenarioId);
}

/**
 * Filter out synthetic trajectories from a list.
 * Logs warnings about rejected trajectories.
 *
 * @returns Only the real trajectories, with synthetic ones filtered out.
 */
export function filterSyntheticTrajectories<
  T extends { agentId: string; scenarioId?: string | null },
>(trajectories: T[], context = 'TrainingPipeline'): T[] {
  const real: T[] = [];
  let syntheticCount = 0;

  for (const t of trajectories) {
    if (isSyntheticTrajectory(t.agentId, t.scenarioId ?? null)) {
      syntheticCount++;
    } else {
      real.push(t);
    }
  }

  if (syntheticCount > 0) {
    logger.warn(
      `Rejected ${syntheticCount} synthetic trajectories`,
      { total: trajectories.length, kept: real.length },
      context
    );
  }

  return real;
}

/**
 * Validate that a trajectory is real (not synthetic).
 * Throws an error if the trajectory appears to be synthetic.
 *
 * Use this for strict validation in critical paths.
 */
export function assertRealTrajectory(
  agentId: string,
  scenarioId: string | null
): void {
  if (isSyntheticTrajectory(agentId, scenarioId)) {
    throw new Error(
      `Synthetic trajectory detected and rejected: agentId=${agentId}, scenarioId=${scenarioId}. ` +
        'Only real agent data is allowed for training.'
    );
  }
}

