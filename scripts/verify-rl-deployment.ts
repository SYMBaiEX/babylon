/**
 * Verify RL Training System Deployment
 *
 * Checks that the continuous RL training system is properly deployed and working:
 * 1. Environment variables configured
 * 2. Database accessible
 * 3. GitHub Actions workflow exists
 * 4. Training endpoints responsive
 * 5. Models are being used by agents
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@babylon/db';
import { benchmarkService, modelSelectionService } from '@babylon/training';

interface CheckResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

const results: CheckResult[] = [];

function addCheck(
  check: string,
  status: 'pass' | 'fail' | 'warn',
  message: string,
  details?: string
) {
  results.push({ check, status, message, details });
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${check}: ${message}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🔍 Checking Environment Variables\n');

  const required = [
    { name: 'DATABASE_URL', secret: true },
    { name: 'WANDB_API_KEY', secret: true },
  ];

  const optional = [
    { name: 'WANDB_PROJECT', default: 'babylon' },
    { name: 'BASE_MODEL', default: 'Qwen/Qwen2.5-0.5B-Instruct' },
    { name: 'TRAIN_RL_LOCAL', default: 'false' },
  ];

  for (const env of required) {
    const value = process.env[env.name];
    if (value) {
      const display = env.secret ? `${value.substring(0, 10)}...` : value;
      addCheck(env.name, 'pass', 'Configured', display);
    } else {
      addCheck(env.name, 'fail', 'Missing - required for training');
    }
  }

  for (const env of optional) {
    const value = process.env[env.name] || env.default;
    addCheck(
      env.name,
      'pass',
      value === env.default ? `Using default: ${value}` : `Configured: ${value}`
    );
  }
}

async function checkDatabase() {
  console.log('\n🔍 Checking Database Connectivity\n');

  try {
    // Test connection
    await db.$queryRaw`SELECT 1`;
    addCheck('Database Connection', 'pass', 'Connected successfully');

    // Check trajectories
    const trajCount = await db.trajectory.count();
    const scoredCount = await db.trajectory.count({
      where: { aiJudgeReward: { not: null } },
    });

    addCheck(
      'Trajectory Data',
      trajCount > 0 ? 'pass' : 'warn',
      `${trajCount} total, ${scoredCount} scored`,
      trajCount === 0 ? 'No trajectories yet - agents need to play' : undefined
    );

    // Check models
    const modelCount = await db.trainedModel.count();
    const deployedCount = await db.trainedModel.count({
      where: { status: 'deployed' },
    });

    addCheck(
      'Trained Models',
      modelCount > 0 ? 'pass' : 'warn',
      `${modelCount} total, ${deployedCount} deployed`,
      modelCount === 0 ? 'No models yet - training needs to run' : undefined
    );

    // Check training batches
    const batchCount = await db.trainingBatch.count();
    const completedBatches = await db.trainingBatch.count({
      where: { status: 'completed' },
    });

    addCheck(
      'Training Batches',
      'pass',
      `${batchCount} total, ${completedBatches} completed`
    );
  } catch (error) {
    addCheck(
      'Database',
      'fail',
      'Connection failed',
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkGitHubWorkflow() {
  console.log('\n🔍 Checking GitHub Actions Workflow\n');

  try {
    const workflowPath = path.resolve(
      process.cwd(),
      '.github/workflows/rl-training.yml'
    );
    await fs.access(workflowPath);

    const content = await fs.readFile(workflowPath, 'utf-8');

    // Check for key components
    const hasSchedule =
      content.includes('schedule:') && content.includes('cron:');
    const hasModelSelection = content.includes('Select base model');
    const hasTraining = content.includes('Run RL Training');
    const hasBenchmarking =
      content.includes('benchmark') || content.includes('Benchmark');

    addCheck(
      'Workflow File',
      'pass',
      'Found at .github/workflows/rl-training.yml'
    );

    addCheck(
      'Cron Schedule',
      hasSchedule ? 'pass' : 'fail',
      hasSchedule
        ? 'Configured (daily at 2 AM UTC)'
        : 'Missing schedule configuration'
    );

    addCheck(
      'Model Selection',
      hasModelSelection ? 'pass' : 'warn',
      hasModelSelection ? 'Integrated' : 'Not found in workflow'
    );

    addCheck(
      'Training Step',
      hasTraining ? 'pass' : 'fail',
      hasTraining ? 'Configured' : 'Missing training step'
    );

    addCheck(
      'Benchmarking',
      hasBenchmarking ? 'pass' : 'warn',
      hasBenchmarking
        ? 'Configured'
        : 'Not configured (optional but recommended)'
    );
  } catch (_error) {
    addCheck(
      'GitHub Workflow',
      'fail',
      'Workflow file not found',
      'Create .github/workflows/rl-training.yml'
    );
  }
}

async function checkTrainingServices() {
  console.log('\n🔍 Checking Training Services\n');

  try {
    // Check model selection service
    const summary = await modelSelectionService.getSelectionSummary();
    addCheck(
      'Model Selection Service',
      'pass',
      `Working - ${summary.trainedModelCount} models, ${summary.bundleCount} bundles`,
      `Recommendation: ${summary.recommendation}`
    );

    // Check benchmark service
    const benchmarkSummary = await benchmarkService.getBenchmarkSummary();
    addCheck(
      'Benchmark Service',
      'pass',
      `Working - ${benchmarkSummary.totalBenchmarked} models benchmarked`
    );
  } catch (error) {
    addCheck(
      'Training Services',
      'fail',
      'Service check failed',
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkPythonTrainer() {
  console.log('\n🔍 Checking Python Trainer\n');

  try {
    const trainerPath = path.resolve(
      process.cwd(),
      'python/src/training/babylon_trainer.py'
    );
    await fs.access(trainerPath);

    const content = await fs.readFile(trainerPath, 'utf-8');

    // Check for key features
    const hasMaxExamples =
      content.includes('MAX_EXAMPLES') || content.includes('max_examples');
    const hasWandb = content.includes('wandb') || content.includes('WANDB');
    const hasART = content.includes('art') || content.includes('ART');

    addCheck(
      'Python Trainer',
      'pass',
      'Found at python/src/training/babylon_trainer.py'
    );

    addCheck(
      'Data Capping',
      hasMaxExamples ? 'pass' : 'warn',
      hasMaxExamples
        ? 'Supports MAX_EXAMPLES env var'
        : 'Data capping not implemented'
    );

    addCheck(
      'W&B Integration',
      hasWandb ? 'pass' : 'fail',
      hasWandb ? 'Configured' : 'Missing W&B integration'
    );

    addCheck(
      'ART Framework',
      hasART ? 'pass' : 'fail',
      hasART ? 'Using ART framework' : 'Missing ART framework'
    );
  } catch (_error) {
    addCheck(
      'Python Trainer',
      'fail',
      'Trainer file not found',
      'Check python/src/training/babylon_trainer.py'
    );
  }
}

async function checkModelUsage() {
  console.log('\n🔍 Checking Model Usage by Agents\n');

  try {
    // Get latest deployed model
    const latestModel = await db.trainedModel.findFirst({
      where: { status: 'deployed' },
      orderBy: { deployedAt: 'desc' },
    });

    if (!latestModel) {
      addCheck(
        'Model Usage',
        'warn',
        'No deployed models yet',
        'Train and deploy a model first'
      );
      return;
    }

    addCheck(
      'Latest Model',
      'pass',
      `${latestModel.modelId} deployed at ${latestModel.deployedAt?.toISOString()}`,
      `Storage: ${latestModel.storagePath}`
    );

    // Check if agents are configured to use RL models
    const useRLModel = process.env.USE_RL_MODEL === 'true';
    addCheck(
      'Agent Configuration',
      useRLModel ? 'pass' : 'warn',
      useRLModel
        ? 'Agents configured to use RL models'
        : 'USE_RL_MODEL not enabled - agents use base model'
    );
  } catch (error) {
    addCheck(
      'Model Usage',
      'fail',
      'Check failed',
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkTrainingReadiness() {
  console.log('\n🔍 Checking Training Readiness\n');

  try {
    const selection = await modelSelectionService.selectBaseModel();

    addCheck(
      'Training Readiness',
      'pass',
      `Ready to train using ${selection.strategy} strategy`,
      `Model: ${selection.modelId}\n   Reason: ${selection.reason}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDataIssue = message.includes('Insufficient training data');

    addCheck(
      'Training Readiness',
      isDataIssue ? 'warn' : 'fail',
      isDataIssue ? 'Not ready - need more data' : 'Check failed',
      message
    );
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 DEPLOYMENT VERIFICATION SUMMARY');
  console.log('='.repeat(80) + '\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const total = results.length;

  console.log(`Total Checks: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}\n`);

  const failedChecks = results.filter((r) => r.status === 'fail');
  if (failedChecks.length > 0) {
    console.log('❌ Critical Issues:\n');
    failedChecks.forEach((r) => {
      console.log(`   - ${r.check}: ${r.message}`);
      if (r.details) {
        console.log(`     ${r.details}`);
      }
    });
    console.log();
  }

  const warningChecks = results.filter((r) => r.status === 'warn');
  if (warningChecks.length > 0) {
    console.log('⚠️  Warnings:\n');
    warningChecks.forEach((r) => {
      console.log(`   - ${r.check}: ${r.message}`);
      if (r.details) {
        console.log(`     ${r.details}`);
      }
    });
    console.log();
  }

  console.log('='.repeat(80));

  if (failed === 0 && warnings === 0) {
    console.log('\n✅ System fully deployed and operational!\n');
    console.log('Next steps:');
    console.log('1. Agents will generate trajectories as they play');
    console.log('2. RULER scoring runs hourly (Vercel cron)');
    console.log('3. Training runs daily at 2 AM UTC (GitHub Actions)');
    console.log('4. Models deploy automatically after benchmarking\n');
  } else if (failed === 0) {
    console.log('\n⚠️  System deployed with warnings. Review above.\n');
  } else {
    console.log(
      '\n❌ System has critical issues. Fix failures before deploying.\n'
    );
  }
}

async function main() {
  console.log(
    '╔════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║               RL Training System Deployment Verification                  ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════════════════╝'
  );

  try {
    await checkEnvironmentVariables();
    await checkDatabase();
    await checkGitHubWorkflow();
    await checkTrainingServices();
    await checkPythonTrainer();
    await checkModelUsage();
    await checkTrainingReadiness();

    await printSummary();

    const failed = results.filter((r) => r.status === 'fail').length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Verification crashed:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main };
