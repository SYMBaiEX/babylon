/**
 * Liquidity Simulation Module
 * 
 * @module simulation
 * 
 * @description
 * Provides tools for simulating and analyzing market liquidity in Babylon.
 * Includes scenarios for testing market stress conditions, health monitoring,
 * and concentrated liquidity features.
 * 
 * @example
 * ```typescript
 * import { 
 *   LiquiditySimulator, 
 *   SCENARIOS,
 *   generateReport,
 *   formatReportForConsole 
 * } from '@/lib/simulation';
 * 
 * const simulator = new LiquiditySimulator(SCENARIOS.normal);
 * const result = await simulator.run();
 * const report = generateReport(result);
 * console.log(formatReportForConsole(report));
 * ```
 */

export {
  LiquiditySimulator,
  SCENARIOS,
  runScenarioComparison,
  type LiquidityScenarioConfig,
  type SimulationEvent,
  type SimulationResult,
  type TickMetrics,
} from './liquidity-simulation';

export {
  generateReport,
  formatReportForConsole,
  compareScenarios,
  exportToJSON,
  exportTimeSeriesCSV,
  type SimulationReport,
  type ReportSummary,
  type TimeSeriesAnalysis,
} from './simulation-report';

