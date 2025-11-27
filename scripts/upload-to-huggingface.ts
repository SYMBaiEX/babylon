/**
 * Upload to HuggingFace (GitHub Actions Version)
 *
 * Uploads collected game data to HuggingFace Hub.
 * Designed to run in GitHub Actions with longer timeouts.
 *
 * Uploads:
 * - Complete game worlds (organized by month)
 * - Agent trajectories
 * - Benchmark results
 *
 * Usage (in GitHub Actions):
 *   bun run scripts/upload-to-huggingface.ts
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../src/lib/logger';

interface UploadResult {
  success: boolean;
  filesUploaded: number;
  datasetUrl?: string;
  error?: string;
}

async function uploadToHuggingFace(): Promise<UploadResult> {
  try {
    const token = process.env.HUGGING_FACE_TOKEN;
    if (!token) {
      throw new Error('HUGGING_FACE_TOKEN environment variable not set');
    }

    const dataDir = path.join(
      process.cwd(),
      'exports',
      'huggingface',
      'latest'
    );

    // Check if data exists
    const summaryPath = path.join(dataDir, 'summary.json');
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));

    logger.info('Uploading to HuggingFace', { summary });

    const datasetName =
      process.env.HF_DATASET_NAME || 'elizaos/babylon-game-data';

    // Generate README for dataset
    await generateDatasetCard(dataDir, summary, datasetName);

    // Upload using huggingface-cli (most reliable in GitHub Actions)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Set token
    process.env.HUGGINGFACE_HUB_TOKEN = token;

    console.log(`\n📤 Uploading to ${datasetName}...`);

    try {
      // Try to create repo first
      await execAsync(
        `huggingface-cli repo create ${datasetName} --type dataset --private=false || true`
      );
      logger.info('Repository ensured');
    } catch (error) {
      // Repo might already exist
      logger.info('Repository may already exist', { error });
    }

    // Upload only the main JSONL files (consistent schemas)
    // Upload metadata separately to avoid schema conflicts
    const filesToUpload = [
      'README.md',
      'index.json',
      'summary.json',
      'trajectories.jsonl',
      'benchmarks.jsonl',
    ];

    console.log('Uploading main dataset files...');
    for (const file of filesToUpload) {
      const filePath = path.join(dataDir, file);
      try {
        await execAsync(
          `huggingface-cli upload ${datasetName} ${filePath} ${file} --repo-type dataset`
        );
        console.log(`✅ Uploaded ${file}`);
      } catch (error) {
        logger.warn(`Failed to upload ${file}`, { error });
      }
    }

    // Upload monthly files to subdirectory (won't conflict with auto-detection)
    console.log('Uploading monthly data files...');
    const monthsDir = path.join(dataDir, 'by-month');
    try {
      const monthFiles = await fs.readdir(monthsDir);
      for (const monthFile of monthFiles) {
        const filePath = path.join(monthsDir, monthFile);
        await execAsync(
          `huggingface-cli upload ${datasetName} ${filePath} monthly-data/${monthFile} --repo-type dataset`
        );
        console.log(`✅ Uploaded monthly-data/${monthFile}`);
      }
    } catch (error) {
      logger.warn('Could not upload monthly files', { error });
    }

    logger.info('Upload complete');

    // Count files uploaded
    let fileCount = filesToUpload.length;

    // Count month files
    try {
      const monthFiles = await fs.readdir(monthsDir);
      fileCount += monthFiles.length;
    } catch {
      // No monthly files yet
    }

    return {
      success: true,
      filesUploaded: fileCount,
      datasetUrl: `https://huggingface.co/datasets/${datasetName}`,
    };
  } catch (error) {
    logger.error('Upload failed', { error });
    return {
      success: false,
      filesUploaded: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function generateDatasetCard(
  outputDir: string,
  summary: Record<string, unknown>,
  datasetName: string
): Promise<void> {
  const card = `---
license: mit
task_categories:
- reinforcement-learning
- game-simulation
- agent-training
tags:
- babylon
- prediction-markets
- game-worlds
- agent-trajectories
- offline-simulation
size_categories:
- 10K<n<100K
---

# ${datasetName}

## Dataset Description

Complete Babylon game data for reinforcement learning and offline simulation.

**Version:** ${summary.version || '1.0.0'}  
**Collected:** ${summary.collectedAt || new Date().toISOString()}  
**Game Worlds:** ${summary.totalWorlds || 0}  
**Agent Trajectories:** ${summary.totalTrajectories || 0}  
**Benchmarks:** ${summary.totalBenchmarks || 0}

## What's Included

### 1. Complete Game Worlds
- Prediction market scenarios
- 30-day timelines with events
- NPC conversations and interactions
- Feed posts and social dynamics
- Ground truth outcomes

### 2. Agent Trajectories
- Complete agent decision sequences
- LLM calls (prompts and responses)
- Game environment at each step
- Actions taken and outcomes
- Rewards and ground truth

### 3. Benchmark Results
- Model performance evaluations
- Comparison to baselines
- Detailed metrics

## Data Organization

### By Month
\`\`\`
by-month/
  2025-10.json  - October 2025 data
  2025-11.json  - November 2025 data
  2025-12.json  - December 2025 data
  ...
\`\`\`

Each month file contains:
- Game worlds generated that month
- Agent trajectories from that month
- Benchmark results from that month

## Offline Simulation

This dataset enables **offline, faster-than-real-time simulation**:

\`\`\`bash
# Download dataset
from datasets import load_dataset
dataset = load_dataset("${datasetName}")

# Load into Babylon offline simulator
bun run scripts/run-offline-simulation.ts \\
  --data=path/to/downloaded/data.json \\
  --fast-forward \\
  --agent=my-agent
\`\`\`

## Use Cases

1. **RL Training** - Train agents on historical gameplay
2. **Model Evaluation** - Test agents on past scenarios
3. **Offline Development** - Develop without live system
4. **Research** - Analyze agent behavior and game dynamics
5. **Faster Testing** - Run simulations at high speed

## Data Format

### Game World
\`\`\`json
{
  "worldId": "...",
  "month": "2025-11",
  "question": "Will Bitcoin reach $100k?",
  "outcome": true,
  "timeline": [ /* 30 days of events */ ],
  "npcs": [ /* NPC data */ ],
  "events": [ /* All events */ ],
  "feedPosts": [ /* Social feed */ ]
}
\`\`\`

### Agent Trajectory
\`\`\`json
{
  "trajectoryId": "...",
  "month": "2025-11",
  "steps": [
    {
      "environment_state": { /* game state */ },
      "llm_calls": [ /* agent decisions */ ],
      "action": { /* what agent did */ },
      "reward": 50
    }
  ],
  "totalReward": 1500,
  "finalPnL": 1500
}
\`\`\`

## Citation

\`\`\`bibtex
@dataset{babylon_game_data_2025,
  title = {Babylon Game Data - Complete RL Dataset},
  author = {Babylon Labs},
  year = {2025},
  url = {https://huggingface.co/datasets/${datasetName}}
}
\`\`\`

## License

MIT
`;

  await fs.writeFile(path.join(outputDir, 'README.md'), card);
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║    UPLOADING TO HUGGINGFACE                            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const result = await uploadToHuggingFace();

  if (result.success) {
    console.log('\n✅ UPLOAD SUCCESSFUL!\n');
    console.log(`Dataset URL: ${result.datasetUrl}`);
    console.log(`Files uploaded: ${result.filesUploaded}`);
    console.log('');
  } else {
    console.error('\n❌ UPLOAD FAILED\n');
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
