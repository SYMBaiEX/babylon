#!/usr/bin/env bun

/**
 * Setup .env.local with all required variables
 * This script helps ensure all necessary environment variables are present
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const ENV_LOCAL_PATH = '.env.local';

interface EnvVar {
  key: string;
  value: string;
  required: boolean;
  description: string;
}

const requiredVars: EnvVar[] = [
  {
    key: 'DATABASE_URL',
    value: 'postgresql://user:password@localhost:5432/babylon',
    required: true,
    description: 'PostgreSQL database connection string',
  },
  {
    key: 'NEXT_PUBLIC_PRIVY_APP_ID',
    value: 'your_privy_app_id',
    required: true,
    description: 'Privy App ID for authentication',
  },
  {
    key: 'PRIVY_APP_SECRET',
    value: 'your_privy_app_secret',
    required: true,
    description: 'Privy App Secret',
  },
  {
    key: 'WANDB_API_KEY',
    value: 'your_wandb_api_key_here',
    required: true,
    description: 'Weights & Biases API key (required for RL training)',
  },
  {
    key: 'CRON_SECRET',
    value: execSync('openssl rand -hex 32', { encoding: 'utf-8' }).trim(),
    required: true,
    description: 'Secret for securing cron endpoints',
  },
];

const rlTrainingVars: EnvVar[] = [
  {
    key: 'RECORD_AGENT_TRAJECTORIES',
    value: 'true',
    required: false,
    description: 'Enable trajectory recording for RL training',
  },
  {
    key: 'TRAJECTORY_SAMPLING_RATE',
    value: '1.0',
    required: false,
    description: 'Trajectory sampling rate (1.0 = record everything)',
  },
  {
    key: 'TRAINING_MIN_TRAJECTORIES',
    value: '1000',
    required: false,
    description: 'Minimum trajectories before training triggers',
  },
  {
    key: 'WANDB_PROJECT',
    value: 'babylon-continuous',
    required: false,
    description: 'W&B project name for training',
  },
  {
    key: 'WANDB_MODEL',
    value: 'unsloth/Qwen3-4B-128K',
    required: false,
    description:
      'W&B model for inference (CRITICAL: Only this model available in ART catalog)',
  },
  {
    key: 'BASE_MODEL',
    value: 'unsloth/Qwen3-4B-128K',
    required: false,
    description: 'Base model for RL training',
  },
  {
    key: 'MODEL_NAME',
    value: 'unsloth/Qwen3-4B-128K',
    required: false,
    description: 'Model name for training',
  },
  {
    key: 'USE_RL_MODEL',
    value: 'false',
    required: false,
    description: 'Enable RL models for agents',
  },
  {
    key: 'TRAINING_MIN_GROUP_SIZE',
    value: '1',
    required: false,
    description: 'Minimum group size for training batches',
  },
  {
    key: 'AUTO_CREATE_AGENT_WALLETS',
    value: 'true',
    required: false,
    description: 'Automatically create wallets for agents',
  },
  {
    key: 'GAME_TICK_BUDGET_MS',
    value: '180000',
    required: false,
    description: 'Game tick budget in milliseconds (3 minutes)',
  },
];

function parseEnvFile(filePath: string): Map<string, string> {
  const envMap = new Map<string, string>();

  if (!existsSync(filePath)) {
    return envMap;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
      if (match && match[1] && match[2]) {
        const key = match[1];
        let value = match[2];
        // Remove quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        envMap.set(key, value);
      }
    }
  }

  return envMap;
}

function writeEnvFile(filePath: string, envMap: Map<string, string>): void {
  const lines: string[] = [];
  lines.push('# Babylon Environment Configuration');
  lines.push('# Generated/Updated by setup-env-local.ts');
  lines.push('# This file is gitignored - never commit secrets!');
  lines.push('');

  // Add required vars
  lines.push('# ============================================');
  lines.push('# REQUIRED');
  lines.push('# ============================================');
  for (const envVar of requiredVars) {
    const value = envMap.get(envVar.key) || envVar.value;
    lines.push(`# ${envVar.description}`);
    lines.push(`${envVar.key}="${value}"`);
    lines.push('');
  }

  // Add RL training vars
  lines.push('# ============================================');
  lines.push('# RL Training & Trajectory Recording');
  lines.push('# ============================================');
  for (const envVar of rlTrainingVars) {
    const value = envMap.get(envVar.key) || envVar.value;
    lines.push(`# ${envVar.description}`);
    lines.push(`${envVar.key}="${value}"`);
    lines.push('');
  }

  writeFileSync(filePath, lines.join('\n'));
}

function main() {
  console.log('🔧 Setting up .env.local...\n');

  const existingEnv = parseEnvFile(ENV_LOCAL_PATH);
  const allVars = [...requiredVars, ...rlTrainingVars];

  // Check for missing required vars
  const missingRequired: string[] = [];
  for (const envVar of requiredVars) {
    if (
      !existingEnv.has(envVar.key) ||
      existingEnv.get(envVar.key) === envVar.value ||
      existingEnv.get(envVar.key)?.includes('your_')
    ) {
      missingRequired.push(envVar.key);
    }
  }

  // Check for missing RL vars
  const missingRL: string[] = [];
  for (const envVar of rlTrainingVars) {
    if (!existingEnv.has(envVar.key)) {
      missingRL.push(envVar.key);
    }
  }

  if (missingRequired.length > 0) {
    console.log('⚠️  Missing required variables:');
    missingRequired.forEach((key) => console.log(`   - ${key}`));
    console.log('');
  }

  if (missingRL.length > 0) {
    console.log('📊 Missing RL training variables:');
    missingRL.forEach((key) => console.log(`   - ${key}`));
    console.log('');
  }

  // Update env file with missing vars
  if (missingRequired.length > 0 || missingRL.length > 0) {
    console.log('📝 Updating .env.local with missing variables...\n');

    // Merge existing with new vars
    const mergedEnv = new Map(existingEnv);
    for (const envVar of allVars) {
      if (!mergedEnv.has(envVar.key)) {
        mergedEnv.set(envVar.key, envVar.value);
      }
    }

    writeEnvFile(ENV_LOCAL_PATH, mergedEnv);
    console.log('✅ .env.local updated!\n');
    console.log('⚠️  IMPORTANT: Please fill in the actual values for:');
    missingRequired.forEach((key) => console.log(`   - ${key}`));
    console.log('');
  } else {
    console.log('✅ All variables are present in .env.local!\n');
  }

  // Show summary
  console.log('📋 Summary:');
  console.log(
    `   Required vars: ${requiredVars.length - missingRequired.length}/${requiredVars.length}`
  );
  console.log(
    `   RL training vars: ${rlTrainingVars.length - missingRL.length}/${rlTrainingVars.length}`
  );
  console.log('');

  if (missingRequired.length === 0 && missingRL.length === 0) {
    console.log('🎉 All environment variables are configured!');
  } else {
    console.log(
      '⚠️  Please update the missing variables with your actual values.'
    );
  }
}

main();
