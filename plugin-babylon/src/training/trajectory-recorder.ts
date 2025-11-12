import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type {
  ActionEvent,
  EpisodeMetadata,
  EpisodeRecord,
  ObservationEvent,
  OutcomeEvent,
  RewardComponent,
  TrajectoryEvent,
} from "./trajectory-types";

// Type alias for JSON values
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

const DEFAULT_OUTPUT_DIR = join(process.cwd(), "training", "episodes");

export class TrajectoryRecorder {
  private readonly outputDir: string;
  private events: TrajectoryEvent[] = [];
  private episodeMetadata: EpisodeMetadata | null = null;
  private finalWallet: EpisodeRecord["finalWallet"];
  private rewardComponents: RewardComponent[] = [];
  private finished = false;

  constructor(private readonly runtime: IAgentRuntime, outputDir?: string) {
    this.outputDir = outputDir || process.env.BABYLON_TRAINING_OUTPUT || DEFAULT_OUTPUT_DIR;
  }

  async startEpisode(
    metadataOverrides: Partial<EpisodeMetadata> = {},
    tags: string[] = [],
  ): Promise<void> {
    const babylonApiUrl =
      (this.runtime.getSetting?.("babylon.apiEndpoint") as string | undefined) ||
      process.env.BABYLON_API_URL ||
      "http://localhost:3000";

    const baseMetadata: EpisodeMetadata = {
      agentId: this.runtime.agentId,
      characterName: this.runtime.character.name || "unknown-agent",
      startTime: Date.now(),
      episodeId: metadataOverrides.episodeId ?? randomUUID(),
      trainingMode: metadataOverrides.trainingMode ?? "autonomous",
      environment: {
        apiBaseUrl: babylonApiUrl,
        a2aEndpoint:
          (this.runtime.getSetting?.("babylon.a2aEndpoint") as string | undefined) ||
          process.env.BABYLON_A2A_ENDPOINT,
      },
      initialWallet: metadataOverrides.initialWallet,
      tags,
    };

    this.episodeMetadata = {
      ...baseMetadata,
      ...metadataOverrides,
      environment: {
        ...baseMetadata.environment,
        ...metadataOverrides.environment,
      },
      tags: Array.from(new Set([...(metadataOverrides.tags ?? []), ...tags])),
    };

    this.events = [];
    this.rewardComponents = [];
    this.finalWallet = undefined;
    this.finished = false;

    await mkdir(this.outputDir, { recursive: true });
    logger.info(
      `🚀 Started Babylon training episode ${this.episodeMetadata.episodeId} (agent: ${this.episodeMetadata.agentId}, dir: ${this.outputDir})`
    );
  }

  get episodeId(): string | null {
    return this.episodeMetadata?.episodeId ?? null;
  }

  recordObservation(label: string, summary: Record<string, JsonValue>): void {
    if (!this.episodeMetadata || this.finished) return;

    const event: ObservationEvent = {
      type: "observation",
      timestamp: Date.now(),
      label,
      summary,
    };
    this.events.push(event);
  }

  recordAction(
    actionName: string,
    input: Record<string, JsonValue>,
    output?: Record<string, JsonValue>,
    error?: string,
  ): void {
    if (!this.episodeMetadata || this.finished) return;
    const event: ActionEvent = {
      type: "action",
      timestamp: Date.now(),
      actionName,
      input,
      output,
      error,
    };
    this.events.push(event);
  }

  recordOutcome(label: string, data: Record<string, JsonValue>): void {
    if (!this.episodeMetadata || this.finished) return;
    const event: OutcomeEvent = {
      type: "outcome",
      timestamp: Date.now(),
      label,
      data,
    };
    this.events.push(event);
  }

  recordRewardComponent(component: RewardComponent): void {
    if (!this.episodeMetadata || this.finished) return;
    this.rewardComponents.push(component);
  }

  setFinalWallet(wallet: EpisodeRecord["finalWallet"]): void {
    this.finalWallet = wallet;
  }

  async finalizeEpisode(
    extra: {
      finalWallet?: EpisodeRecord["finalWallet"];
      rewardTotal?: number;
      rewardComponents?: RewardComponent[];
    } = {},
  ): Promise<EpisodeRecord> {
    if (!this.episodeMetadata) {
      throw new Error("Cannot finalize episode before startEpisode()");
    }
    if (this.finished) {
      throw new Error(`Episode ${this.episodeMetadata.episodeId} already finalized`);
    }

    this.finished = true;
    const finishedAt = Date.now();

    const reward = (() => {
      const components = extra.rewardComponents ?? this.rewardComponents;
      const total =
        typeof extra.rewardTotal === "number"
          ? extra.rewardTotal
          : components.reduce((sum, component) => sum + component.value, 0);
      return {
        total,
        components,
      };
    })();

    const record: EpisodeRecord = {
      metadata: this.episodeMetadata,
      events: this.events,
      finalWallet: extra.finalWallet ?? this.finalWallet,
      reward,
      finishedAt,
      durationMs: finishedAt - this.episodeMetadata.startTime,
    };

    const outputPath = join(
      this.outputDir,
      `${this.episodeMetadata.episodeId}.json`,
    );
    await writeFile(outputPath, JSON.stringify(record, null, 2), "utf-8");

    logger.info(
      `✅ Finalized Babylon training episode ${this.episodeMetadata.episodeId} (path: ${outputPath}, duration: ${record.durationMs}ms, reward: ${reward.total}, events: ${this.events.length})`
    );

    return record;
  }
}

export class TrainingRecorderRegistry {
  private static RECORDERS = new WeakMap<IAgentRuntime, TrajectoryRecorder>();

  static ensureRecorder(runtime: IAgentRuntime, outputDir?: string): TrajectoryRecorder {
    let recorder = this.RECORDERS.get(runtime);
    if (!recorder) {
      recorder = new TrajectoryRecorder(runtime, outputDir);
      this.RECORDERS.set(runtime, recorder);
    }
    return recorder;
  }

  static getRecorder(runtime: IAgentRuntime): TrajectoryRecorder | undefined {
    return this.RECORDERS.get(runtime);
  }

  static removeRecorder(runtime: IAgentRuntime): void {
    this.RECORDERS.delete(runtime);
  }
}


