import {
  Service,
  type IAgentRuntime,
  type UUID,
  asUUID,
} from '@elizaos/core';
import { type Trajectory, type TrajectoryStep } from './types';

export class TrajectoryLoggerService extends Service {
  public static serviceName = 'trajectory-logger';
  public static override serviceType = 'trajectory-logger';
  public override capabilityDescription =
    'Records agent interaction trajectories for training and analysis.';

  private activeTrajectories: Map<UUID, Trajectory> = new Map();
  private completedTrajectories: Trajectory[] = [];

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
  }

  public static override async start(
    runtime: IAgentRuntime,
  ): Promise<TrajectoryLoggerService> {
    const service = new TrajectoryLoggerService(runtime);
    runtime.logger.info('TrajectoryLoggerService started.');
    // In the future, we might load pending trajectories from DB here
    return service;
  }

  public override async stop(): Promise<void> {
    // In the future, we might save pending trajectories to DB here
    this.activeTrajectories.clear();
    this.runtime.logger.info('TrajectoryLoggerService stopped.');
  }

  /**
   * Starts a new trajectory recording.
   * @param agentId The ID of the agent this trajectory belongs to.
   * @param initialMetadata Optional metadata to associate with the trajectory.
   * @returns The ID of the newly created trajectory.
   */
  public startTrajectory(
    agentId: UUID,
    initialMetadata: Record<string, any> = {},
  ): UUID {
    const trajectoryId = asUUID(crypto.randomUUID());
    const trajectory: Trajectory = {
      trajectoryId,
      agentId,
      startTime: Date.now(),
      endTime: 0,
      steps: [],
      totalReward: 0,
      metadata: {
        episodeLength: 0,
        finalStatus: 'terminated',
        ...initialMetadata,
      },
    };
    this.activeTrajectories.set(trajectoryId, trajectory);
    this.runtime.logger.info(
      `[TrajectoryLogger] Started trajectory ${trajectoryId} for agent ${agentId}`,
    );
    return trajectoryId;
  }

  /**
   * Adds a step to an active trajectory.
   * @param trajectoryId The ID of the trajectory to add the step to.
   * @param step The trajectory step data.
   */
  public addStep(trajectoryId: UUID, step: Omit<TrajectoryStep, 'stepId' | 'timestamp'>): void {
    const trajectory = this.activeTrajectories.get(trajectoryId);
    if (!trajectory) {
      this.runtime.logger.warn(`Attempted to add a step to non-existent trajectory ${trajectoryId}`);
      return;
    }

    const trajectoryStep: TrajectoryStep = {
      ...step,
      stepId: asUUID(crypto.randomUUID()),
      timestamp: Date.now(),
    };

    trajectory.steps.push(trajectoryStep);
    trajectory.totalReward += step.reward;
    this.runtime.logger.info(
      `[TrajectoryLogger] Added step to trajectory ${trajectoryId}. Total steps: ${trajectory.steps.length}`,
    );
  }

  /**
   * Ends an active trajectory recording.
   * @param trajectoryId The ID of the trajectory to end.
   * @param finalStatus The final status of the episode.
   * @returns The completed trajectory, or null if not found.
   */
  public endTrajectory(
    trajectoryId: UUID,
    finalStatus: 'completed' | 'terminated' | 'error' = 'completed',
  ): Trajectory | null {
    const trajectory = this.activeTrajectories.get(trajectoryId);
    if (!trajectory) {
      this.runtime.logger.warn(`Attempted to end non-existent trajectory ${trajectoryId}`);
      return null;
    }

    trajectory.endTime = Date.now();
    trajectory.metadata.episodeLength = trajectory.steps.length;
    trajectory.metadata.finalStatus = finalStatus;

    this.completedTrajectories.push(trajectory);
    this.activeTrajectories.delete(trajectoryId);

    this.runtime.logger.info(
      `[TrajectoryLogger] Ended trajectory ${trajectoryId}. Total steps: ${
        trajectory.steps.length
      }, Total reward: ${trajectory.totalReward.toFixed(2)}`,
    );
    // Here we would typically save the trajectory to a database or file.
    this.saveTrajectoryToFile(trajectory);
    
    return trajectory;
  }

  /**
   * Retrieves all completed trajectories.
   * @returns An array of completed trajectories.
   */
  public getCompletedTrajectories(): Trajectory[] {
    return [...this.completedTrajectories];
  }

  private async saveTrajectoryToFile(trajectory: Trajectory) {
    try {
      // In a real implementation, this would use a more robust storage solution.
      // For now, we'll save it to a local directory for inspection.
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const trajectoryDir = path.resolve(process.cwd(), 'trajectories');
      await fs.mkdir(trajectoryDir, { recursive: true });
      const filePath = path.join(trajectoryDir, `trajectory-${trajectory.trajectoryId}.json`);
      await fs.writeFile(filePath, JSON.stringify(trajectory, null, 2));
      this.runtime.logger.info(
        `[TrajectoryLogger] Saved trajectory ${trajectory.trajectoryId} to ${filePath}`,
      );
    } catch (error) {
      this.runtime.logger.error(
        `[TrajectoryLogger] Failed to save trajectory ${trajectory.trajectoryId} to file`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
