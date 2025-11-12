import { type UUID, type Content } from '@elizaos/core';

export interface TrajectoryStep {
  stepId: UUID;
  timestamp: number;
  state: Record<string, any>;
  action: Content;
  reward: number;
  observation: Record<string, any>;
}

export interface Trajectory {
  trajectoryId: UUID;
  agentId: UUID;
  startTime: number;
  endTime: number;
  steps: TrajectoryStep[];
  totalReward: number;
  metadata: {
    episodeLength: number;
    finalStatus: 'completed' | 'terminated' | 'error';
    [key: string]: any;
  };
}
