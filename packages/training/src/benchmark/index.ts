/**
 * Benchmark Module
 *
 * Tools for evaluating agent performance through simulation.
 */

export { BenchmarkDataGenerator } from './BenchmarkDataGenerator';
export type { BenchmarkConfig, BenchmarkGameSnapshot } from './BenchmarkDataGenerator';

export { BenchmarkHistoryService } from './BenchmarkHistoryService';
export type { BenchmarkResultInput, BenchmarkHistoryQuery, BenchmarkTrendData } from './BenchmarkHistoryService';

export { BenchmarkRunner } from './BenchmarkRunner';
export type { BenchmarkRunConfig, BenchmarkComparisonResult } from './BenchmarkRunner';

export { BenchmarkValidator } from './BenchmarkValidator';

export { FastEvalRunner } from './FastEvalRunner';
export type { FastEvalConfig, FastEvalResult } from './FastEvalRunner';

export { MetricsValidator } from './MetricsValidator';

export { MetricsVisualizer } from './MetricsVisualizer';

export { ModelBenchmarkService } from './ModelBenchmarkService';
export type {
  ModelBenchmarkOptions,
  ModelBenchmarkResult,
  ModelComparisonResult,
  AverageMetrics,
} from './ModelBenchmarkService';

export {
  MODEL_REGISTRY,
  getModelById,
  getModelByModelId,
  getBaselineModels,
  getModelsByProvider,
  getModelsByTier,
  validateModelId,
  getModelDisplayName,
} from './ModelRegistry';
export type { ModelConfig } from './ModelRegistry';

export {
  extractMarketOutcomesFromBenchmark,
  getHiddenFactsForTick,
  getHiddenEventsForTick,
  wasDecisionOptimal,
  getTrueFacts,
  createRulerContext,
  scoreActionAgainstGroundTruth,
} from './RulerBenchmarkIntegration';

export { SimulationA2AInterface } from './SimulationA2AInterface';

export { SimulationEngine } from './SimulationEngine';
export type {
  SimulationConfig,
  SimulationResult,
  SimulationMetrics,
} from './SimulationEngine';

export { BenchmarkChartGenerator } from './BenchmarkChartGenerator';
export type { ModelComparisonData, BenchmarkHistoryEntry } from './BenchmarkChartGenerator';

export { BenchmarkDataViewer } from './BenchmarkDataViewer';

