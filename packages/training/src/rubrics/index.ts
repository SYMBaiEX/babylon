/**
 * Archetype Evaluation Rubrics
 *
 * LLM judge rubrics for each agent archetype defining what "success" means.
 */

import { ASS_KISSER_PRIORITY_METRICS, ASS_KISSER_RUBRIC } from './ass-kisser';
import { DEGEN_PRIORITY_METRICS, DEGEN_RUBRIC } from './degen';
import {
  GOODY_TWOSHOES_PRIORITY_METRICS,
  GOODY_TWOSHOES_RUBRIC,
} from './goody-twoshoes';
import {
  INFORMATION_TRADER_PRIORITY_METRICS,
  INFORMATION_TRADER_RUBRIC,
} from './information-trader';
import { INFOSEC_PRIORITY_METRICS, INFOSEC_RUBRIC } from './infosec';
import { LIAR_PRIORITY_METRICS, LIAR_RUBRIC } from './liar';
import {
  PERPS_TRADER_PRIORITY_METRICS,
  PERPS_TRADER_RUBRIC,
} from './perps-trader';
import { RESEARCHER_PRIORITY_METRICS, RESEARCHER_RUBRIC } from './researcher';
import { SCAMMER_PRIORITY_METRICS, SCAMMER_RUBRIC } from './scammer';
import {
  SOCIAL_BUTTERFLY_PRIORITY_METRICS,
  SOCIAL_BUTTERFLY_RUBRIC,
} from './social-butterfly';
import {
  SUPER_PREDICTOR_PRIORITY_METRICS,
  SUPER_PREDICTOR_RUBRIC,
} from './super-predictor';
import { TRADER_PRIORITY_METRICS, TRADER_RUBRIC } from './trader';

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
  trader: TRADER_RUBRIC,
  'social-butterfly': SOCIAL_BUTTERFLY_RUBRIC,
  scammer: SCAMMER_RUBRIC,
  degen: DEGEN_RUBRIC,
  researcher: RESEARCHER_RUBRIC,
  'information-trader': INFORMATION_TRADER_RUBRIC,
  'goody-twoshoes': GOODY_TWOSHOES_RUBRIC,
  'ass-kisser': ASS_KISSER_RUBRIC,
  'perps-trader': PERPS_TRADER_RUBRIC,
  'super-predictor': SUPER_PREDICTOR_RUBRIC,
  infosec: INFOSEC_RUBRIC,
  liar: LIAR_RUBRIC,
  // Aliases
  socialbutterfly: SOCIAL_BUTTERFLY_RUBRIC,
  goodytwoshoes: GOODY_TWOSHOES_RUBRIC,
  asskisser: ASS_KISSER_RUBRIC,
  perpstrader: PERPS_TRADER_RUBRIC,
  superpredictor: SUPER_PREDICTOR_RUBRIC,
  informationtrader: INFORMATION_TRADER_RUBRIC,
};

/**
 * Priority metrics for each archetype
 */
export const PRIORITY_METRICS: Record<string, string[]> = {
  trader: TRADER_PRIORITY_METRICS,
  'social-butterfly': SOCIAL_BUTTERFLY_PRIORITY_METRICS,
  scammer: SCAMMER_PRIORITY_METRICS,
  degen: DEGEN_PRIORITY_METRICS,
  researcher: RESEARCHER_PRIORITY_METRICS,
  'information-trader': INFORMATION_TRADER_PRIORITY_METRICS,
  'goody-twoshoes': GOODY_TWOSHOES_PRIORITY_METRICS,
  'ass-kisser': ASS_KISSER_PRIORITY_METRICS,
  'perps-trader': PERPS_TRADER_PRIORITY_METRICS,
  'super-predictor': SUPER_PREDICTOR_PRIORITY_METRICS,
  infosec: INFOSEC_PRIORITY_METRICS,
  liar: LIAR_PRIORITY_METRICS,
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
