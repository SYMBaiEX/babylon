import { beforeAll, afterAll, describe, it, expect } from 'bun:test';
import { AgentRuntime, stringToUuid, type UUID } from '@elizaos/core';
import sqlPlugin, { DatabaseMigrationService, createDatabaseAdapter } from '@elizaos/plugin-sql';
import { trajectoryLoggerPlugin } from '../index';
import { TrajectoryLoggerService } from '../TrajectoryLoggerService';
import path from 'node:path';
import fs from 'node:fs/promises';

const TRAJECTORY_DIR = path.resolve(process.cwd(), 'trajectories');

describe('TrajectoryLoggerService (PostgreSQL)', () => {
  let connectionUri: string;
  let runtime: AgentRuntime;
  let agentId: UUID;

  beforeAll(async () => {
    connectionUri = process.env.POSTGRES_URL ?? '';
    if (!connectionUri) {
      throw new Error('POSTGRES_URL must be set to run the trajectory logger integration test');
    }

    agentId = stringToUuid('Trajectory Logger Test Agent');

    console.info('[TrajectoryLoggerTest] Running migrations against', connectionUri);
    const migrationAdapter = createDatabaseAdapter(
      { postgresUrl: connectionUri },
      agentId,
    );
    if (typeof (migrationAdapter as any).init === 'function') {
      await (migrationAdapter as any).init();
    }

    const migrationService = new DatabaseMigrationService();
    const migrationDb =
      typeof (migrationAdapter as any).getDatabase === 'function'
        ? (migrationAdapter as any).getDatabase()
        : undefined;
    if (!migrationDb) {
      throw new Error('Failed to obtain database handle for migrations');
    }
    await migrationService.initializeWithDatabase(migrationDb);
    migrationService.discoverAndRegisterPluginSchemas([sqlPlugin]);
    await migrationService.runAllPluginMigrations();
    console.info('[TrajectoryLoggerTest] Migrations complete');

    await fs.rm(TRAJECTORY_DIR, { recursive: true, force: true });

    const character = {
      name: 'Trajectory Logger Test Agent',
      bio: ['Test agent used for trajectory logger integration tests.'],
      plugins: ['@elizaos/plugin-sql', '@elizaos/plugin-trajectory-logger'],
      settings: {
        POSTGRES_URL: connectionUri,
      },
    };

    console.info('[TrajectoryLoggerTest] Initializing runtime...');
    runtime = new AgentRuntime({
      character,
      agentId,
      plugins: [sqlPlugin, trajectoryLoggerPlugin],
      settings: {
        POSTGRES_URL: connectionUri,
      },
    });

    runtime.registerDatabaseAdapter(migrationAdapter as any);

    await runtime.initialize();
    console.info('[TrajectoryLoggerTest] Runtime initialized');
  });

  afterAll(async () => {
    if (runtime) {
      await runtime.stop();
      const adapter = runtime.adapter as { close?: () => Promise<void> } | undefined;
      if (adapter?.close) {
        await adapter.close();
      }
    }

    await fs.rm(TRAJECTORY_DIR, { recursive: true, force: true });
  });

  it('records complete trajectories and persists output to disk', async () => {
    const service = runtime.getService<TrajectoryLoggerService>('trajectory-logger');
    expect(service).toBeInstanceOf(TrajectoryLoggerService);

    const trajectoryId = service!.startTrajectory(agentId, {
      episode: 'integration-test',
    });

    service!.addStep(trajectoryId, {
      state: { phase: 'analysis' },
      action: { text: 'Assess market conditions' },
      reward: 0.25,
      observation: { market: 'stable' },
    });

    service!.addStep(trajectoryId, {
      state: { phase: 'execution' },
      action: { text: 'Execute optimal trade' },
      reward: 0.75,
      observation: { outcome: 'success' },
    });

    const completed = await service!.endTrajectory(trajectoryId, 'completed');
    expect(completed).not.toBeNull();
    expect(completed!.steps).toHaveLength(2);
    expect(completed!.totalReward).toBeCloseTo(1.0, 5);
    expect(completed!.metadata.finalStatus).toBe('completed');

    const filePath = path.join(
      TRAJECTORY_DIR,
      `trajectory-${completed!.trajectoryId}.json`,
    );

    const fileExists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);

    const fileContents = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(fileContents.steps).toHaveLength(2);
    expect(fileContents.totalReward).toBeCloseTo(1.0, 5);
    expect(fileContents.metadata.finalStatus).toBe('completed');
  });
});
