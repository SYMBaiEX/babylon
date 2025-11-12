import type { TrainingConfig } from "../../eliza/plugin-training/src/types";
import { HuggingFaceClient } from "../../eliza/plugin-training/src/utils/huggingface-client";

type RuntimeShimLike = {
  getSetting: (key: string) => string | undefined;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
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
  } as unknown as IAgentRuntime["logger"];
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


