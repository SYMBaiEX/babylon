/**
 * Archetype Evaluation Rubrics
 *
 * LLM judge rubrics for each agent archetype defining what "success" means.
 */

import { TRADER_RUBRIC, TRADER_PRIORITY_METRICS } from './trader';
import { SOCIAL_BUTTERFLY_RUBRIC, SOCIAL_BUTTERFLY_PRIORITY_METRICS } from './social-butterfly';
import { SCAMMER_RUBRIC, SCAMMER_PRIORITY_METRICS } from './scammer';
import { DEGEN_RUBRIC, DEGEN_PRIORITY_METRICS } from './degen';
import { RESEARCHER_RUBRIC, RESEARCHER_PRIORITY_METRICS } from './researcher';
import { INFORMATION_TRADER_RUBRIC, INFORMATION_TRADER_PRIORITY_METRICS } from './information-trader';
import { GOODY_TWOSHOES_RUBRIC, GOODY_TWOSHOES_PRIORITY_METRICS } from './goody-twoshoes';
import { ASS_KISSER_RUBRIC, ASS_KISSER_PRIORITY_METRICS } from './ass-kisser';
import { PERPS_TRADER_RUBRIC, PERPS_TRADER_PRIORITY_METRICS } from './perps-trader';
import { SUPER_PREDICTOR_RUBRIC, SUPER_PREDICTOR_PRIORITY_METRICS } from './super-predictor';
import { INFOSEC_RUBRIC, INFOSEC_PRIORITY_METRICS } from './infosec';
import { LIAR_RUBRIC, LIAR_PRIORITY_METRICS } from './liar';

/**
 * Default rubric for unknown archetypes
 */
export const DEFAULT_RUBRIC = `
## General Agent Evaluation

You are evaluating an AI agent's performance in a prediction market simulation.

### Scoring Criteria (0.0 to 1.0)
- **Profitability**: Higher P&L should receive higher scores
- **Risk Management**: Balanced positions and avoiding excessive losses
- **Efficiency**: Achieving goals with fewer actions is better
- **Decision Quality**: Good reasoning and analysis before actions

### Scoring Guidelines
- 0.8-1.0: Excellent performance, consistent profits, good risk management
- 0.6-0.8: Good performance, positive P&L, reasonable decisions
- 0.4-0.6: Average performance, mixed results
- 0.2-0.4: Below average, some losses, questionable decisions
- 0.0-0.2: Poor performance, significant losses, poor decision making

Compare trajectories RELATIVE to each other within this group.
If one trajectory is significantly better, reflect that in score differences.
`;

export const DEFAULT_PRIORITY_METRICS = [
  'trading.totalPnL',
  'trading.winRate',
  'behavior.actionSuccessRate',
  'behavior.episodeLength',
];

/**
 * Registry of all archetype rubrics
 */
export const RUBRICS: Record<string, string> = {
  'trader': TRADER_RUBRIC,
  'social-butterfly': SOCIAL_BUTTERFLY_RUBRIC,
  'scammer': SCAMMER_RUBRIC,
  'degen': DEGEN_RUBRIC,
  'researcher': RESEARCHER_RUBRIC,
  'information-trader': INFORMATION_TRADER_RUBRIC,
  'goody-twoshoes': GOODY_TWOSHOES_RUBRIC,
  'ass-kisser': ASS_KISSER_RUBRIC,
  'perps-trader': PERPS_TRADER_RUBRIC,
  'super-predictor': SUPER_PREDICTOR_RUBRIC,
  'infosec': INFOSEC_RUBRIC,
  'liar': LIAR_RUBRIC,
  // Aliases
  'socialbutterfly': SOCIAL_BUTTERFLY_RUBRIC,
  'goodytwoshoes': GOODY_TWOSHOES_RUBRIC,
  'asskisser': ASS_KISSER_RUBRIC,
  'perpstrader': PERPS_TRADER_RUBRIC,
  'superpredictor': SUPER_PREDICTOR_RUBRIC,
  'informationtrader': INFORMATION_TRADER_RUBRIC,
};

/**
 * Priority metrics for each archetype
 */
export const PRIORITY_METRICS: Record<string, string[]> = {
  'trader': TRADER_PRIORITY_METRICS,
  'social-butterfly': SOCIAL_BUTTERFLY_PRIORITY_METRICS,
  'scammer': SCAMMER_PRIORITY_METRICS,
  'degen': DEGEN_PRIORITY_METRICS,
  'researcher': RESEARCHER_PRIORITY_METRICS,
  'information-trader': INFORMATION_TRADER_PRIORITY_METRICS,
  'goody-twoshoes': GOODY_TWOSHOES_PRIORITY_METRICS,
  'ass-kisser': ASS_KISSER_PRIORITY_METRICS,
  'perps-trader': PERPS_TRADER_PRIORITY_METRICS,
  'super-predictor': SUPER_PREDICTOR_PRIORITY_METRICS,
  'infosec': INFOSEC_PRIORITY_METRICS,
  'liar': LIAR_PRIORITY_METRICS,
};

/**
 * Get the rubric for an archetype
 */
export function getRubric(archetype: string): string {
  const normalized = archetype.toLowerCase().trim();
  return RUBRICS[normalized] || DEFAULT_RUBRIC;
}

/**
 * Get priority metrics for an archetype
 */
export function getPriorityMetrics(archetype: string): string[] {
  const normalized = archetype.toLowerCase().trim();
  return PRIORITY_METRICS[normalized] || DEFAULT_PRIORITY_METRICS;
}

/**
 * Check if an archetype has a custom rubric
 */
export function hasCustomRubric(archetype: string): boolean {
  const normalized = archetype.toLowerCase().trim();
  return normalized in RUBRICS;
}

/**
 * Get all available archetype names
 */
export function getAvailableArchetypes(): string[] {
  return [
    'trader',
    'social-butterfly',
    'scammer',
    'degen',
    'researcher',
    'information-trader',
    'goody-twoshoes',
    'ass-kisser',
    'perps-trader',
    'super-predictor',
    'infosec',
    'liar',
  ];
}

// Re-export individual rubrics
export {
  TRADER_RUBRIC,
  SOCIAL_BUTTERFLY_RUBRIC,
  SCAMMER_RUBRIC,
  DEGEN_RUBRIC,
  RESEARCHER_RUBRIC,
  INFORMATION_TRADER_RUBRIC,
  GOODY_TWOSHOES_RUBRIC,
  ASS_KISSER_RUBRIC,
  PERPS_TRADER_RUBRIC,
  SUPER_PREDICTOR_RUBRIC,
  INFOSEC_RUBRIC,
  LIAR_RUBRIC,
};

