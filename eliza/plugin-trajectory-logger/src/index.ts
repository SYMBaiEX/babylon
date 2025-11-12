import { type Plugin } from '@elizaos/core';
import { TrajectoryLoggerService } from './TrajectoryLoggerService';

export const trajectoryLoggerPlugin: Plugin = {
  name: '@elizaos/plugin-trajectory-logger',
  description:
    'Collects agent interaction trajectories for RLAIF training cycles.',
  dependencies: ['@elizaos/plugin-sql'],
  services: [TrajectoryLoggerService],
};

export default trajectoryLoggerPlugin;
