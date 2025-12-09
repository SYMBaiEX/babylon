/**
 * Shared simulation configuration and constants.
 *
 * @module engine/config/simulation
 *
 * @description
 * Centralized constants for simulation mode to avoid duplication
 * between GameSimulator, InMemoryStateStore, and other simulation code.
 */

/**
 * Default NPC/Agent names for simulation
 * Used by both fast simulation and training adapters
 */
export const SIMULATION_AGENT_NAMES = [
  'Marcus Chen',
  'Sarah Williams',
  'Alex Rivera',
  'Jordan Lee',
  'Emma Thompson',
  'David Kim',
  'Lisa Patel',
  'Chris Morgan',
  'Rachel Santos',
  'James Wilson',
  'Olivia Brown',
  'Michael Davis',
  'Sophia Martinez',
  'Daniel Taylor',
  'Ava Anderson',
] as const;

/**
 * Sample prediction market questions for simulation
 */
export const SIMULATION_QUESTIONS = [
  'Will TechCorp announce quarterly earnings above expectations?',
  'Will the Fed raise interest rates this month?',
  'Will CryptoToken reach $100 by end of day?',
  'Will the merger between MegaCorp and StartupInc be approved?',
  'Will the new regulation pass the committee vote?',
] as const;

/**
 * Prediction market templates for generating questions
 */
export const PREDICTION_TEMPLATES = [
  {
    q: 'Will {company} stock reach ${target} by end of month?',
    desc: 'Price target prediction',
  },
  {
    q: 'Will {company} announce earnings beat this quarter?',
    desc: 'Earnings prediction',
  },
  {
    q: 'Will {sector} sector outperform market this week?',
    desc: 'Sector performance',
  },
  {
    q: 'Will {company} announce new product launch?',
    desc: 'Product announcement',
  },
] as const;

/**
 * Sample companies for simulation
 */
export const SIMULATION_COMPANIES = [
  { ticker: 'TECH', name: 'TechCorp Industries', sector: 'Technology' },
  { ticker: 'FINA', name: 'FinaBank Holdings', sector: 'Finance' },
  { ticker: 'HLTH', name: 'HealthGen Solutions', sector: 'Healthcare' },
  { ticker: 'ENRG', name: 'EnergyFlow Corp', sector: 'Energy' },
  { ticker: 'RETA', name: 'RetailMax Inc', sector: 'Retail' },
] as const;

/**
 * Clue templates for insider information distribution
 */
export const SIMULATION_CLUE_TEMPLATES = {
  positive: [
    'Insider sources suggest outcome leaning positive',
    'Early indicators point toward YES',
    'Key stakeholder reportedly supportive',
    'Internal documents hint at favorable decision',
    'Reliable sources confirm positive trajectory',
  ],
  negative: [
    'Insider sources suggest outcome leaning negative',
    'Early indicators point toward NO',
    'Key stakeholder reportedly opposed',
    'Internal documents hint at unfavorable decision',
    'Reliable sources confirm negative trajectory',
  ],
} as const;

/**
 * Default simulation configuration
 */
export const DEFAULT_SIMULATION_CONFIG = {
  numAgents: 10,
  numPredictionMarkets: 5,
  numPerpMarkets: 5,
  durationDays: 30,
  startingBalance: 10000,
  liquidityB: 100,
  insiderPercentage: 0.3,
} as const;

/**
 * Agent trading strategies for simulation
 */
export type SimulationStrategy =
  | 'informed'
  | 'momentum'
  | 'contrarian'
  | 'random';

export const SIMULATION_STRATEGIES: readonly SimulationStrategy[] = [
  'informed',
  'momentum',
  'contrarian',
  'random',
] as const;

