import type { TrainingConfig } from "../plugin-training/src/types";
import { HuggingFaceClient } from "../plugin-training/src/utils/huggingface-client";
import { IAgentRuntime } from "@elizaos/core";

type RuntimeShimLike = {
  getSetting: (key: string) => string | undefined;
  logger: IAgentRuntime["logger"];
};

class RuntimeShim implements RuntimeShimLike {
  constructor(private readonly settings: Record<string, string | undefined>) {}

  getSetting(key: string): string | undefined {
    return this.settings[key];
  }

  logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    trace: console.debug,
    fatal: console.error,
    success: console.log,
    progress: console.log,
    log: console.log,
    clear: () => console.clear ? console.clear() : undefined,
    child: () => this.logger,
    level: 'info' as const,
  } as IAgentRuntime["logger"];
}

export interface DatasetUploadConfig {
  datasetName: string;
  organization?: string;
  private?: boolean;
  license?: string;
}

export async function uploadDatasetToHub(
  datasetDir: string,
  config: DatasetUploadConfig,
  extractionConfig: Record<string, unknown>,
): Promise<string> {
  const runtime = new RuntimeShim({
    HUGGING_FACE_TOKEN: process.env.HUGGING_FACE_TOKEN,
  });
  const client = new HuggingFaceClient(runtime as never);
  await client.initialize();

  const trainingConfig = {
    huggingFaceConfig: {
      datasetName: config.datasetName,
      organization: config.organization,
      private: config.private ?? true,
      license: config.license ?? "apache-2.0",
    },
    extractionConfig,
    datasetConfig: {
      outputFormat: "jsonl",
    },
    rlaifConfig: {
      strategy: "ruler",
    },
  } as unknown as TrainingConfig;

  return client.uploadDataset(datasetDir, trainingConfig);
}


