#!/usr/bin/env bun

/**
 * Model Management Commands
 *
 * Commands:
 *   list       - List available models
 *   upload     - Upload model to HuggingFace
 */

import { db, closeDatabase } from '@babylon/db';
import { HuggingFaceModelUploader } from '@babylon/training';
import { parseArgs, wantsHelp, getOption, getFlag } from '../lib/args.js';
import { logger } from '../lib/logger.js';

function printHelp(): void {
  console.log(`
Model Management

USAGE:
  babylon model <command> [options]

COMMANDS:
  list        List available trained models
  upload      Upload model to HuggingFace Hub

OPTIONS (upload):
  --model=ID            Model ID from database (required)
  --hf-name=NAME        HuggingFace model name (required)
  --description=DESC    Model description
  --private             Make model private
  --no-weights          Don't upload model weights

ENVIRONMENT:
  HUGGING_FACE_TOKEN or HF_TOKEN  Your HuggingFace API token

EXAMPLES:
  babylon model list
  babylon model upload --model=babylon-agent-v1 --hf-name=babylonlabs/babylon-agent
  babylon model upload --model=v1 --hf-name=org/model --private

ADVANCED:
  For benchmarking, use the full pipeline:
    bun run scripts/run-full-rl-pipeline.ts --archetype <name>
`);
}

async function listModels(): Promise<void> {
  logger.header('Trained Models');

  const models = await db.trainedModel.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (models.length === 0) {
    console.log('No trained models found in database.');
    console.log('\nTo train a model:');
    console.log('  babylon train archetype -a <archetype>');
    return;
  }

  console.log(`Found ${models.length} model(s):\n`);

  for (const model of models) {
    console.log(`${'─'.repeat(60)}`);
    console.log(`Model ID:    ${model.modelId}`);
    console.log(`Base Model:  ${model.baseModel || 'N/A'}`);
    console.log(`Status:      ${model.status}`);
    console.log(`Created:     ${model.createdAt.toISOString()}`);
    if (model.huggingFaceRepo) {
      console.log(`HuggingFace: ${model.huggingFaceRepo}`);
    }
    if (model.wandbRunId) {
      console.log(`W&B Run:     ${model.wandbRunId}`);
    }
    if (model.benchmarkScore !== null) {
      console.log(`Benchmark:   ${model.benchmarkScore.toFixed(2)}`);
    }
  }
  console.log(`${'─'.repeat(60)}`);
}

async function uploadModel(args: ReturnType<typeof parseArgs>): Promise<void> {
  const modelId = getOption(args, 'model');
  const hfModelName = getOption(args, 'hf-name');
  const description = getOption(args, 'description');
  const isPrivate = getFlag(args, 'private');
  const includeWeights = !getFlag(args, 'no-weights');

  if (!modelId || !hfModelName) {
    logger.fail('--model and --hf-name arguments are required');
    printHelp();
    process.exit(1);
  }

  // Check token
  if (!process.env.HUGGING_FACE_TOKEN && !process.env.HF_TOKEN) {
    logger.fail('HUGGING_FACE_TOKEN or HF_TOKEN environment variable required');
    console.log('\nSet your token:');
    console.log('  export HUGGING_FACE_TOKEN=your_token_here');
    console.log('\nOr get a token from: https://huggingface.co/settings/tokens');
    process.exit(1);
  }

  logger.header('HuggingFace Model Upload');

  console.log(`Model ID: ${modelId}`);
  console.log(`HuggingFace Name: ${hfModelName}`);
  console.log(`Private: ${isPrivate ? 'yes' : 'no'}`);
  console.log(`Include Weights: ${includeWeights ? 'yes' : 'no'}\n`);

  // Check if model exists
  const model = await db.trainedModel.findUnique({
    where: { modelId },
  });

  if (!model) {
    logger.fail(`Model not found: ${modelId}`);
    console.log('\nAvailable models:');
    const models = await db.trainedModel.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const m of models) {
      console.log(`  - ${m.modelId}`);
    }
    process.exit(1);
  }

  logger.success(`Found model: ${model.modelId}`);
  console.log(`  Base model: ${model.baseModel}`);
  console.log(`  Status: ${model.status}`);
  console.log(`  Created: ${model.createdAt.toISOString()}`);

  // Upload to HuggingFace
  logger.step('Uploading to HuggingFace...');

  const uploader = new HuggingFaceModelUploader();

  const result = await uploader.uploadModel({
    modelId,
    modelName: hfModelName,
    description: description || `Babylon RL agent model: ${modelId}`,
    private: isPrivate,
    includeWeights,
  });

  if (result.success && result.modelUrl) {
    logger.success('Upload complete!');
    console.log(`\n🔗 Model URL: ${result.modelUrl}`);

    // Update database with HuggingFace repo
    await db.trainedModel.update({
      where: { modelId },
      data: { huggingFaceRepo: hfModelName },
    });
  } else {
    logger.fail(`Upload failed: ${result.error || 'Unknown error'}`);
    process.exit(1);
  }
}

export async function runModelCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case 'list':
        await listModels();
        break;

      case 'upload':
        await uploadModel(parsed);
        break;

      default:
        if (parsed.command) {
          logger.fail(`Unknown command: ${parsed.command}`);
        }
        printHelp();
        process.exit(parsed.command ? 1 : 0);
    }
  } finally {
    await closeDatabase();
  }
}
