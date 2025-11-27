#!/usr/bin/env bun

/**
 * Model Management Commands
 *
 * Commands:
 *   list          - List available models
 *   upload        - Upload model to HuggingFace
 *   collect-data  - Collect game data for HuggingFace dataset
 *   upload-dataset - Upload dataset to HuggingFace
 */

import { promises as fs } from 'fs';
import * as path from 'path';
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
  list           List available trained models
  upload         Upload model to HuggingFace Hub
  collect-data   Collect game data for HuggingFace dataset
  upload-dataset Upload dataset to HuggingFace

OPTIONS (upload):
  --model=ID            Model ID from database (required)
  --hf-name=NAME        HuggingFace model name (required)
  --description=DESC    Model description
  --private             Make model private
  --no-weights          Don't upload model weights

OPTIONS (collect-data):
  --output=DIR          Output directory (default: data/huggingface)
  --days=N              Number of days to collect (default: 30)

OPTIONS (upload-dataset):
  --source=DIR          Data source directory (default: data/huggingface)
  --repo=NAME           HuggingFace repo name (required)
  --private             Make dataset private

ENVIRONMENT:
  HUGGING_FACE_TOKEN or HF_TOKEN  Your HuggingFace API token

EXAMPLES:
  babylon model list
  babylon model collect-data --days=7
  babylon model upload-dataset --repo=babylonlabs/game-data
  babylon model upload --model=v1 --hf-name=org/model --private

ADVANCED:
  For full RL pipeline: babylon train pipeline --archetype <name>
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
    if (model.benchmarkScore !== null) {
      console.log(`Benchmark:   ${model.benchmarkScore.toFixed(2)}`);
    }
  }
  console.log(`${'─'.repeat(60)}`);
}

async function collectGameData(args: ReturnType<typeof parseArgs>): Promise<void> {
  const outputDir = getOption(args, 'output') || 'data/huggingface';
  const daysParam = getOption(args, 'days');
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  logger.header('Collecting Training Data for HuggingFace');
  console.log(`Output Directory: ${outputDir}`);
  console.log(`Days to collect: ${days}\n`);

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  logger.step('Collecting trajectories...');
  const trajectories = await db.trajectory.findMany({
    where: {
      createdAt: { gte: cutoffDate },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`  Found ${trajectories.length} trajectories`);

  logger.step('Collecting benchmark results...');
  const benchmarks = await db.benchmarkResult.findMany({
    where: {
      runAt: { gte: cutoffDate },
    },
    orderBy: { runAt: 'desc' },
  });
  console.log(`  Found ${benchmarks.length} benchmark results`);

  logger.step('Collecting trained models...');
  const models = await db.trainedModel.findMany({
    where: {
      createdAt: { gte: cutoffDate },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`  Found ${models.length} trained models`);

  // Write data files
  const timestamp = new Date().toISOString().split('T')[0];

  logger.step('Writing data files...');

  const trajectoriesPath = path.join(outputDir, `trajectories-${timestamp}.json`);
  await fs.writeFile(trajectoriesPath, JSON.stringify(trajectories, null, 2));
  console.log(`  Wrote ${trajectoriesPath}`);

  const benchmarksPath = path.join(outputDir, `benchmarks-${timestamp}.json`);
  await fs.writeFile(benchmarksPath, JSON.stringify(benchmarks, null, 2));
  console.log(`  Wrote ${benchmarksPath}`);

  const modelsPath = path.join(outputDir, `models-${timestamp}.json`);
  await fs.writeFile(modelsPath, JSON.stringify(models, null, 2));
  console.log(`  Wrote ${modelsPath}`);

  // Write metadata
  const metadata = {
    collectedAt: new Date().toISOString(),
    cutoffDate: cutoffDate.toISOString(),
    counts: {
      trajectories: trajectories.length,
      benchmarks: benchmarks.length,
      models: models.length,
    },
  };
  const metadataPath = path.join(outputDir, `metadata-${timestamp}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  logger.success('Data collection complete!');
  console.log(`\nTotal files: 4`);
  console.log(`Total records: ${trajectories.length + benchmarks.length + models.length}`);
  console.log(`\nTo upload to HuggingFace:`);
  console.log(`  babylon model upload-dataset --source=${outputDir} --repo=<your-repo>`);
}

async function uploadDataset(args: ReturnType<typeof parseArgs>): Promise<void> {
  const sourceDir = getOption(args, 'source') || 'data/huggingface';
  const repoName = getOption(args, 'repo');
  const isPrivate = getFlag(args, 'private');

  if (!repoName) {
    logger.fail('--repo argument is required');
    printHelp();
    process.exit(1);
  }

  // Check token
  const token = process.env.HUGGING_FACE_TOKEN || process.env.HF_TOKEN;
  if (!token) {
    logger.fail('HUGGING_FACE_TOKEN or HF_TOKEN environment variable required');
    console.log('\nSet your token:');
    console.log('  export HUGGING_FACE_TOKEN=your_token_here');
    console.log('\nOr get a token from: https://huggingface.co/settings/tokens');
    process.exit(1);
  }

  logger.header('Uploading Dataset to HuggingFace');
  console.log(`Source: ${sourceDir}`);
  console.log(`Repo: ${repoName}`);
  console.log(`Private: ${isPrivate ? 'yes' : 'no'}\n`);

  // Check source directory exists
  try {
    await fs.access(sourceDir);
  } catch {
    logger.fail(`Source directory not found: ${sourceDir}`);
    console.log('\nRun data collection first:');
    console.log('  babylon model collect-data');
    process.exit(1);
  }

  // Get all JSON files in source directory
  const files = await fs.readdir(sourceDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    logger.fail('No JSON files found in source directory');
    process.exit(1);
  }

  console.log(`Found ${jsonFiles.length} files to upload:`);
  for (const file of jsonFiles) {
    const stat = await fs.stat(path.join(sourceDir, file));
    console.log(`  - ${file} (${(stat.size / 1024).toFixed(1)} KB)`);
  }
  console.log('');

  const HF_API_URL = 'https://huggingface.co/api';

  // Create repository using HuggingFace API
  logger.step('Creating/updating repository...');

  const createRepoResponse = await fetch(`${HF_API_URL}/repos/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repoName.split('/').pop(),
      organization: repoName.includes('/') ? repoName.split('/')[0] : undefined,
      type: 'dataset',
      private: isPrivate,
    }),
  });

  if (createRepoResponse.ok) {
    console.log(`  Created repository: ${repoName}`);
  } else if (createRepoResponse.status === 409) {
    console.log(`  Using existing repository: ${repoName}`);
  } else {
    const errorText = await createRepoResponse.text();
    logger.fail(`Failed to create repository: ${errorText}`);
    process.exit(1);
  }

  // Upload files
  logger.step('Uploading files...');

  for (const file of jsonFiles) {
    const filePath = path.join(sourceDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    const uploadResponse = await fetch(
      `${HF_API_URL}/datasets/${repoName}/upload/main/${file}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: content,
      }
    );

    if (uploadResponse.ok) {
      console.log(`  Uploaded: ${file}`);
    } else {
      const errorText = await uploadResponse.text();
      logger.warn(`  Failed to upload ${file}: ${errorText}`);
    }
  }

  logger.success('Dataset upload complete!');
  console.log(`\n🔗 Dataset URL: https://huggingface.co/datasets/${repoName}`);
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
    process.exit(0);
  }

  try {
    switch (parsed.command) {
      case 'list':
        await listModels();
        break;

      case 'upload':
        await uploadModel(parsed);
        break;

      case 'collect-data':
        await collectGameData(parsed);
        break;

      case 'upload-dataset':
        await uploadDataset(parsed);
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
