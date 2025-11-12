import type { IAgentRuntime } from "@elizaos/core";
import { Service, logger } from "@elizaos/core";
import { BabylonClientService } from "../plugin";
import { TrajectoryRecorder, TrainingRecorderRegistry } from "./trajectory-recorder";

interface TrainingServiceConfig {
  tags: string[];
  outputDir?: string;
  mode: "autonomous" | "scripted" | "evaluation";
  [key: string]: string | string[] | undefined;
}

const TRAINING_ENABLED =
  process.env.BABYLON_TRAINING_ENABLED === "true" ||
  process.env.BABYLON_TRAINING_ENABLED === "1";

export class BabylonTrainingService extends Service {
  static override serviceType = "babylon_training" as const;
  override capabilityDescription =
    "Records agent trajectories, environment signals, and rewards for continuous training.";

  private recorder?: TrajectoryRecorder;
  public readonly config: TrainingServiceConfig;
  private readonly enabled: boolean;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    const tags = (process.env.BABYLON_TRAINING_TAGS ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    this.config = {
      tags,
      outputDir: process.env.BABYLON_TRAINING_OUTPUT,
      mode:
        (process.env.BABYLON_TRAINING_MODE as TrainingServiceConfig["mode"]) ??
        "autonomous",
    };
    this.enabled = TRAINING_ENABLED;
  }

  static override async start(
    runtime: IAgentRuntime,
  ): Promise<BabylonTrainingService> {
    const service = new BabylonTrainingService(runtime);
    if (!service.enabled) {
      logger.info("Babylon training service disabled (set BABYLON_TRAINING_ENABLED=true to enable).");
      return service;
    }

    const recorder = TrainingRecorderRegistry.ensureRecorder(
      runtime,
      service.config.outputDir,
    );

    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    const wallet =
      (await babylonService?.getClient().getWallet().catch(() => undefined)) ??
      undefined;

    await recorder.startEpisode(
      {
        trainingMode: service.config.mode,
        initialWallet: wallet
          ? {
              balance: wallet.balance,
              availableBalance: wallet.availableBalance,
              lockedBalance: wallet.lockedBalance,
            }
          : undefined,
      },
      service.config.tags,
    );

    service.recorder = recorder;
    logger.info("Babylon training recorder started.");

    const handleExit = async () => {
      try {
        await service.finalizeEpisode();
      } catch (error) {
        logger.error("Failed to finalize episode on exit: " + String(error));
      }
    };

    process.once("SIGINT", handleExit);
    process.once("SIGTERM", handleExit);

    return service;
  }

  override async stop(): Promise<void> {
    if (!this.enabled) return;
    await this.finalizeEpisode();
    if (this.recorder) {
      TrainingRecorderRegistry.removeRecorder(this.runtime);
      this.recorder = undefined;
    }
    logger.info("Babylon training service stopped.");
  }

  private async finalizeEpisode(): Promise<void> {
    if (!this.recorder) return;
    try {
      const babylonService = this.runtime.getService<BabylonClientService>(
        BabylonClientService.serviceType,
      );
      const wallet =
        (await babylonService?.getClient().getWallet().catch(() => undefined)) ??
        undefined;

      await this.recorder.finalizeEpisode({
        finalWallet: wallet
          ? {
              balance: wallet.balance,
              availableBalance: wallet.availableBalance,
              lockedBalance: wallet.lockedBalance,
            }
          : undefined,
      });
    } catch (error) {
      logger.error("Failed to finalize Babylon training episode: " + String(error));
    }
  }
}

export function getTrainingRecorder(runtime: IAgentRuntime): TrajectoryRecorder | undefined {
  if (!TRAINING_ENABLED) return undefined;
  return TrainingRecorderRegistry.getRecorder(runtime);
}


