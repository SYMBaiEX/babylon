/**
 * Benchmark Runner
 *
 * Coordinates the complete benchmarking process:
 * 1. Load or generate benchmark data
 * 2. Initialize simulation engine
 * 3. Run agent through simulation
 * 4. Collect metrics and trajectory data
 * 5. Save results
 *
 * Can run multiple agents and compare their performance.
 */

import type { IAgentRuntime } from '@elizaos/core';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createAutonomousCoordinator } from '../dependencies';
import { logger } from '../utils/logger';
import { TrajectoryRecorder } from '../training/TrajectoryRecorder';
import {
  type BenchmarkConfig,
  BenchmarkDataGenerator,
  type BenchmarkGameSnapshot,
} from './BenchmarkDataGenerator';
import { SimulationA2AInterface } from './SimulationA2AInterface';
import {
  type SimulationConfig,
  SimulationEngine,
  type SimulationResult,
} from './SimulationEngine';

export interface BenchmarkRunConfig {
  /** Path to benchmark snapshot file (or will generate new one) */
  benchmarkPath?: string;

  /** If no snapshot provided, use this config to generate */
  generatorConfig?: BenchmarkConfig;

  /** Agent runtime to test */
  agentRuntime: IAgentRuntime;

  /** Agent user ID */
  agentUserId: string;

  /** Whether to save trajectory data for RL training */
  saveTrajectory: boolean;

  /** Output directory for results */
  outputDir: string;

  /** Force specific model (bypasses W&B lookup) - for baseline testing */
  forceModel?: string;
}

export interface BenchmarkComparisonResult {
  /** All individual run results */
  runs: SimulationResult[];

  /** Comparison metrics */
  comparison: {
    avgPnl: number;
    avgAccuracy: number;
    avgOptimality: number;
    bestRun: string;
    worstRun: string;
  };

  /** Trajectory data (if saved) */
  trajectories?: string[];
}

export class BenchmarkRunner {
  /**
   * Run a single benchmark
   *
   * Executes a complete benchmark run by loading or generating benchmark data,
   * initializing the simulation engine, running the agent through the simulation,
   * and collecting comprehensive metrics and trajectory data.
   *
   * @param config - Benchmark run configuration
   * @returns SimulationResult with metrics, actions, and trajectory data
   * @throws Error if benchmark fails to load/generate or simulation fails
   *
   * @remarks
   * - Can load existing benchmark from file or generate new one
   * - Supports trajectory recording for RL training
   * - Validates that agent actually took actions
   * - Saves results to output directory
   *
   * @example
   * ```typescript
   * const result = await BenchmarkRunner.runSingle({
   *   benchmarkPath: './benchmarks/test.json',
   *   agentRuntime: runtime,
   *   agentUserId: 'agent-123',
   *   saveTrajectory: true,
   *   outputDir: './results'
   * });
   * console.log(`P&L: ${result.metrics.totalPnl}`);
   * ```
   */
  static async runSingle(
    config: BenchmarkRunConfig
  ): Promise<SimulationResult> {
    logger.info('Starting benchmark run', {
      agentUserId: config.agentUserId,
      benchmarkPath: config.benchmarkPath,
    });

    // 1. Load or generate benchmark
    const snapshot = config.benchmarkPath
      ? await this.loadBenchmark(config.benchmarkPath)
      : await this.generateBenchmark(config.generatorConfig!);

    // 2. Create simulation engine
    const simConfig: SimulationConfig = {
      snapshot,
      agentId: config.agentUserId,
      fastForward: true,
      responseTimeout: 30000,
    };

    const engine = new SimulationEngine(simConfig);

    // 3. Set up A2A interface for agent
    const a2aInterface = new SimulationA2AInterface(engine, config.agentUserId);

    // Inject A2A interface into agent runtime
    interface RuntimeWithA2A extends IAgentRuntime {
      a2aClient?: SimulationA2AInterface;
    }
    (config.agentRuntime as RuntimeWithA2A).a2aClient = a2aInterface;

    // Force model if specified (for baseline testing)
    if (config.forceModel) {
      logger.info('Forcing model for benchmark', {
        agentUserId: config.agentUserId,
        forcedModel: config.forceModel,
      });

      // Set model in runtime settings to bypass W&B lookup
      const runtime = config.agentRuntime as RuntimeWithA2A & {
        character?: { settings?: Record<string, string> };
        getSetting?: (key: string) => string | undefined;
        setSetting?: (key: string, value: string) => void;
      };

      // Determine if it's a Groq model or W&B model
      const isGroqModel =
        config.forceModel.includes('qwen') ||
        config.forceModel.includes('llama');

      if (runtime.character?.settings) {
        if (isGroqModel) {
          // Force Groq model by disabling W&B
          runtime.character.settings.WANDB_ENABLED = 'false';
          runtime.character.settings.LARGE_GROQ_MODEL = config.forceModel;
          runtime.character.settings.SMALL_GROQ_MODEL = config.forceModel;
        } else {
          // Force W&B model
          runtime.character.settings.WANDB_ENABLED = 'true';
          runtime.character.settings.WANDB_MODEL = config.forceModel;
        }
      }

      // Also set via setSetting if available
      if (runtime.setSetting) {
        if (isGroqModel) {
          runtime.setSetting('WANDB_ENABLED', 'false');
          runtime.setSetting('LARGE_GROQ_MODEL', config.forceModel);
          runtime.setSetting('SMALL_GROQ_MODEL', config.forceModel);
        } else {
          runtime.setSetting('WANDB_ENABLED', 'true');
          runtime.setSetting('WANDB_MODEL', config.forceModel);
        }
      }
    }

    // 4. Set up trajectory recording if enabled
    let trajectoryRecorder: TrajectoryRecorder | undefined;
    let trajectoryId: string | undefined;
    if (config.saveTrajectory) {
      // Fail fast - trajectory recording setup errors should crash
      trajectoryRecorder = new TrajectoryRecorder();
      trajectoryId = await trajectoryRecorder.startTrajectory({
        agentId: config.agentUserId,
        scenarioId: `benchmark-${snapshot.id}`,
      });
      logger.info('Trajectory recording started', { trajectoryId });
    }

    // 5. Initialize simulation
    engine.initialize();

    // 6. Run simulation loop
    logger.info('Starting simulation loop', {
      agentUserId: config.agentUserId,
      totalTicks: snapshot.ticks.length,
    });

    // Get AutonomousCoordinator for running agent ticks
    const coordinator = createAutonomousCoordinator();

    // Run autonomous ticks for each simulation tick
    let ticksCompleted = 0;
    while (!engine.isComplete()) {
      const currentTick = engine.getCurrentTickNumber();

      if (currentTick % 100 === 0 || currentTick < 5) {
        logger.info(
          `Benchmark progress: ${currentTick}/${snapshot.ticks.length} ticks`,
          {
            agentUserId: config.agentUserId,
          }
        );
      }

      // Execute autonomous tick (agent makes decisions via A2A)
      // Fail fast - don't catch errors, let them propagate
      const tickResult = await coordinator.executeAutonomousTick(
        config.agentUserId,
        config.agentRuntime
      );

      if (
        tickResult.success &&
        tickResult.actionsExecuted &&
        tickResult.actionsExecuted.length > 0
      ) {
        logger.debug('Agent took actions', {
          tick: currentTick,
          actions: tickResult.actionsExecuted,
        });
      }

      // Advance simulation tick
      engine.advanceTick();
      ticksCompleted++;

      // Small delay to avoid overwhelming the system (can be made faster)
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    logger.info('Simulation loop complete', {
      agentUserId: config.agentUserId,
      ticksCompleted,
      totalTicks: snapshot.ticks.length,
    });

    // 7. Calculate final results
    const result = await engine.run();

    // 8. Validate results - ensure agent actually did something
    if (result.ticksProcessed === 0) {
      throw new Error('Benchmark failed: No ticks were processed');
    }

    if (result.actions.length === 0) {
      logger.warn('Benchmark completed but agent took no actions', {
        agentUserId: config.agentUserId,
        ticksProcessed: result.ticksProcessed,
      });
    }

    // 9. Save trajectory if enabled
    if (trajectoryRecorder && trajectoryId) {
      // Fail fast - trajectory recording errors should crash
      await trajectoryRecorder.endTrajectory(trajectoryId, {
        finalPnL: result.metrics.totalPnl,
        finalBalance: undefined,
      });
      logger.info('Trajectory recording saved', { trajectoryId });
    }

    // 10. Save results
    await this.saveResult(result, config.outputDir);

    logger.info('Benchmark run completed', {
      agentUserId: config.agentUserId,
      totalPnl: result.metrics.totalPnl,
      accuracy: result.metrics.predictionMetrics.accuracy,
      optimalityScore: result.metrics.optimalityScore,
    });

    return result;
  }

  /**
   * Run multiple benchmarks and compare
   *
   * Executes multiple benchmark runs with the same configuration and compares
   * their results to assess consistency and average performance.
   *
   * @param config - Benchmark run configuration
   * @param numRuns - Number of iterations to run
   * @returns BenchmarkComparisonResult with aggregated metrics and comparison
   *
   * @remarks
   * - Runs benchmarks sequentially with small delays between runs
   * - Calculates average P&L, accuracy, and optimality scores
   * - Identifies best and worst performing runs
   * - Saves comparison report to output directory
   *
   * @example
   * ```typescript
   * const comparison = await BenchmarkRunner.runMultiple(config, 5);
   * console.log(`Average P&L: ${comparison.comparison.avgPnl}`);
   * console.log(`Best run: ${comparison.comparison.bestRun}`);
   * ```
   */
  static async runMultiple(
    config: BenchmarkRunConfig,
    numRuns: number
  ): Promise<BenchmarkComparisonResult> {
    logger.info(`Running ${numRuns} benchmark iterations`, {
      agentUserId: config.agentUserId,
    });

    const runs: SimulationResult[] = [];
    const trajectoryPaths: string[] = [];

    for (let i = 0; i < numRuns; i++) {
      logger.info(`Starting run ${i + 1}/${numRuns}`);

      const result = await this.runSingle({
        ...config,
        outputDir: path.join(config.outputDir, `run-${i + 1}`),
      });

      runs.push(result);

      if (config.saveTrajectory) {
        trajectoryPaths.push(
          path.join(config.outputDir, `run-${i + 1}`, 'trajectory.json')
        );
      }

      // Small delay between runs
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Calculate comparison metrics
    const avgPnl =
      runs.reduce((sum, r) => sum + r.metrics.totalPnl, 0) / runs.length;
    const avgAccuracy =
      runs.reduce((sum, r) => sum + r.metrics.predictionMetrics.accuracy, 0) /
      runs.length;
    const avgOptimality =
      runs.reduce((sum, r) => sum + r.metrics.optimalityScore, 0) / runs.length;

    const bestRun = runs.reduce((best, current) =>
      current.metrics.totalPnl > best.metrics.totalPnl ? current : best
    );

    const worstRun = runs.reduce((worst, current) =>
      current.metrics.totalPnl < worst.metrics.totalPnl ? current : worst
    );

    const comparison = {
      avgPnl,
      avgAccuracy,
      avgOptimality,
      bestRun: bestRun.id,
      worstRun: worstRun.id,
    };

    // Save comparison report
    await this.saveComparison(
      {
        runs,
        comparison,
        trajectories: config.saveTrajectory ? trajectoryPaths : undefined,
      },
      config.outputDir
    );

    logger.info('Multiple benchmarks completed', comparison);

    return {
      runs,
      comparison,
      trajectories: config.saveTrajectory ? trajectoryPaths : undefined,
    };
  }

  /**
   * Compare two agents on same benchmark
   *
   * Runs two different agents on the same benchmark snapshot and compares
   * their performance to determine which performs better.
   *
   * @param agent1Config - Configuration for first agent
   * @param agent2Config - Configuration for second agent
   * @param benchmarkPath - Path to benchmark snapshot (same for both agents)
   * @returns Comparison result with both agents' results and performance delta
   *
   * @remarks
   * - Runs both agents in parallel for efficiency
   * - Compares P&L, accuracy, and optimality scores
   * - Determines winner based on total P&L
   *
   * @example
   * ```typescript
   * const comparison = await BenchmarkRunner.compareAgents(
   *   agent1Config,
   *   agent2Config,
   *   './benchmarks/test.json'
   * );
   * console.log(`Winner: ${comparison.winner}`);
   * console.log(`P&L Delta: ${comparison.delta.pnl}`);
   * ```
   */
  static async compareAgents(
    agent1Config: BenchmarkRunConfig,
    agent2Config: BenchmarkRunConfig,
    benchmarkPath: string
  ): Promise<{
    agent1: SimulationResult;
    agent2: SimulationResult;
    winner: string;
    delta: {
      pnl: number;
      accuracy: number;
      optimality: number;
    };
  }> {
    logger.info('Comparing two agents', {
      agent1: agent1Config.agentUserId,
      agent2: agent2Config.agentUserId,
      benchmark: benchmarkPath,
    });

    // Run both agents on same benchmark
    const [result1, result2] = await Promise.all([
      this.runSingle({ ...agent1Config, benchmarkPath }),
      this.runSingle({ ...agent2Config, benchmarkPath }),
    ]);

    const winner =
      result1.metrics.totalPnl > result2.metrics.totalPnl
        ? agent1Config.agentUserId
        : agent2Config.agentUserId;

    const delta = {
      pnl: result1.metrics.totalPnl - result2.metrics.totalPnl,
      accuracy:
        result1.metrics.predictionMetrics.accuracy -
        result2.metrics.predictionMetrics.accuracy,
      optimality:
        result1.metrics.optimalityScore - result2.metrics.optimalityScore,
    };

    logger.info('Agent comparison completed', {
      winner,
      delta,
    });

    return {
      agent1: result1,
      agent2: result2,
      winner,
      delta,
    };
  }

  /**
   * Load benchmark from file
   *
   * @param benchmarkPath - Path to benchmark JSON file
   * @returns Parsed benchmark snapshot
   * @throws Error if file cannot be read or parsed
   */
  private static async loadBenchmark(
    benchmarkPath: string
  ): Promise<BenchmarkGameSnapshot> {
    try {
      const data = await fs.readFile(benchmarkPath, 'utf-8');
      const parsed = JSON.parse(data) as BenchmarkGameSnapshot;

      // Validate basic structure
      if (!parsed.id || !parsed.initialState || !parsed.groundTruth) {
        throw new Error(
          `Invalid benchmark file: missing required fields (id, initialState, or groundTruth)`
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Failed to parse benchmark JSON file: ${error.message}`
        );
      }
      if ((error as { code?: string })?.code === 'ENOENT') {
        throw new Error(`Benchmark file not found: ${benchmarkPath}`);
      }
      throw error;
    }
  }

  /**
   * Generate new benchmark
   *
   * Creates a new benchmark snapshot using the provided configuration
   * and saves it for future reuse.
   *
   * @param config - Benchmark generation configuration
   * @returns Generated benchmark snapshot
   * @throws Error if generation fails
   */
  private static async generateBenchmark(
    config: BenchmarkConfig
  ): Promise<BenchmarkGameSnapshot> {
    logger.info('Generating new benchmark', config);

    const generator = new BenchmarkDataGenerator(config);
    const snapshot = await generator.generate();

    // Save for reuse
    const outputPath = path.join(
      process.cwd(),
      'benchmarks',
      `benchmark-${snapshot.id}.json`
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));

    logger.info('Benchmark generated and saved', { path: outputPath });

    return snapshot;
  }

  /**
   * Save simulation result
   *
   * Saves complete simulation results including metrics, trajectory data,
   * and full result object to the output directory.
   *
   * @param result - Simulation result to save
   * @param outputDir - Directory to save results in
   */
  private static async saveResult(
    result: SimulationResult,
    outputDir: string
  ): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    // Save full result
    const resultPath = path.join(outputDir, 'result.json');
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));

    // Save metrics summary
    const metricsPath = path.join(outputDir, 'metrics.json');
    await fs.writeFile(metricsPath, JSON.stringify(result.metrics, null, 2));

    // Save trajectory
    const trajectoryPath = path.join(outputDir, 'trajectory.json');
    await fs.writeFile(
      trajectoryPath,
      JSON.stringify(result.trajectory, null, 2)
    );

    logger.debug('Results saved', { outputDir });
  }

  /**
   * Save comparison report
   *
   * Saves benchmark comparison results to a JSON file in the output directory.
   *
   * @param comparison - Comparison result to save
   * @param outputDir - Directory to save comparison in
   */
  private static async saveComparison(
    comparison: BenchmarkComparisonResult,
    outputDir: string
  ): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    const comparisonPath = path.join(outputDir, 'comparison.json');
    await fs.writeFile(comparisonPath, JSON.stringify(comparison, null, 2));

    logger.debug('Comparison saved', { outputDir });
  }
}
