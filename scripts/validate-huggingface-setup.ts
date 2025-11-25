/**
 * Validate HuggingFace Setup
 * 
 * Comprehensive validation of HuggingFace integration before deployment.
 * Checks all components, configurations, and dependencies.
 * 
 * Usage:
 *   npx ts-node scripts/validate-huggingface-setup.ts
 */

import { huggingFaceIntegration } from '@/lib/huggingface/HuggingFaceIntegrationService';
import { ModelBenchmarkService } from '@/lib/benchmark/ModelBenchmarkService';
import { db } from '@/db';
import * as path from 'path';
import { promises as fs } from 'fs';

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  fix?: string;
}

const issues: ValidationIssue[] = [];

function addIssue(severity: 'error' | 'warning' | 'info', category: string, message: string, fix?: string) {
  issues.push({ severity, category, message, fix });
}

async function validateEnvironment(): Promise<void> {
  console.log('\n📋 Validating Environment Variables...');

  if (!process.env.HUGGING_FACE_TOKEN && !process.env.HF_TOKEN) {
    addIssue('error', 'Environment', 'HUGGING_FACE_TOKEN or HF_TOKEN not set', 'export HUGGING_FACE_TOKEN=hf_xxxxx');
  } else {
    console.log('   ✅ HuggingFace token configured');
  }

  if (!process.env.CRON_SECRET) {
    addIssue('warning', 'Environment', 'CRON_SECRET not set (CRON job cannot be triggered)', 'export CRON_SECRET=your_secret');
  } else {
    console.log('   ✅ CRON_SECRET configured');
  }

  if (!process.env.DATABASE_URL) {
    addIssue('error', 'Environment', 'DATABASE_URL not set', 'Configure your database connection');
  } else {
    console.log('   ✅ DATABASE_URL configured');
  }

  console.log('   ℹ️  Dataset name: ' + (process.env.HF_DATASET_NAME || 'babylonlabs/agent-benchmarks (default)'));
  console.log('   ℹ️  Trajectory dataset: ' + (process.env.HF_TRAJECTORY_DATASET_NAME || 'babylonlabs/agent-trajectories (default)'));
  console.log('   ℹ️  Model name: ' + (process.env.HF_MODEL_NAME || 'babylonlabs/babylon-agent (default)'));
}

async function validateDatabase(): Promise<void> {
  console.log('\n📊 Validating Database Schema...');

  try {
    await db.$connect();
    console.log('   ✅ Database connection successful');

    // Check BenchmarkResult table
    try {
      const count = await db.benchmarkResult.count();
      console.log(`   ✅ BenchmarkResult table exists (${count} records)`);
      
      if (count === 0) {
        addIssue('warning', 'Database', 'No benchmark results in database', 'Run: bun run hf:benchmark --model=MODEL_ID');
      }
    } catch (error) {
      addIssue('error', 'Database', 'BenchmarkResult table does not exist', 'Run: npx drizzle-kit push --name add_benchmark_results_table');
    }

    // Check TrainedModel schema
    const model = await db.trainedModel.findFirst();
    if (model) {
      if (!('huggingFaceRepo' in model)) {
        addIssue('error', 'Database', 'TrainedModel missing huggingFaceRepo field', 'Run: npx drizzle-kit push');
      }
      if (!('lastBenchmarked' in model)) {
        addIssue('error', 'Database', 'TrainedModel missing lastBenchmarked field', 'Run: npx drizzle-kit push');
      }
      if (!('benchmarkCount' in model)) {
        addIssue('error', 'Database', 'TrainedModel missing benchmarkCount field', 'Run: npx drizzle-kit push');
      }
      
      if ('huggingFaceRepo' in model && 'lastBenchmarked' in model && 'benchmarkCount' in model) {
        console.log('   ✅ TrainedModel schema up to date');
      }
    } else {
      addIssue('info', 'Database', 'No trained models in database yet', 'This is normal for new installations');
    }

    // Check Trajectory table
    const trajectoryCount = await db.trajectory.count({
      where: { isTrainingData: true },
    });
    console.log(`   ✅ Trajectory table exists (${trajectoryCount} training trajectories)`);
    
    if (trajectoryCount === 0) {
      addIssue('warning', 'Database', 'No training trajectories in database', 'Generate with: npx ts-node scripts/generate-test-trajectories.ts');
    }
  } catch (error) {
    addIssue('error', 'Database', 'Database connection failed: ' + (error instanceof Error ? error.message : String(error)));
  }
}

async function validateBenchmarks(): Promise<void> {
  console.log('\n🎯 Validating Benchmarks...');

  const standardBenchmarks = await ModelBenchmarkService.getStandardBenchmarkPaths();
  
  if (standardBenchmarks.length === 0) {
    addIssue('error', 'Benchmarks', 'No standard benchmarks found', 'Run: npx ts-node scripts/generate-standard-benchmarks.ts');
  } else {
    console.log(`   ✅ Found ${standardBenchmarks.length} standard benchmarks`);
    standardBenchmarks.forEach(p => console.log(`      - ${path.basename(p)}`));
  }

  // Check for benchmark results files
  const benchmarkResultsDir = path.join(process.cwd(), 'benchmarks', 'model-results');
  const hasResultsDir = await fs.access(benchmarkResultsDir).then(() => true).catch(() => false);
  
  if (hasResultsDir) {
    console.log('   ✅ Benchmark results directory exists');
  } else {
    addIssue('info', 'Benchmarks', 'No benchmark results directory yet', 'Will be created automatically when benchmarks are run');
  }
}

async function validateFileStructure(): Promise<void> {
  console.log('\n📁 Validating File Structure...');

  const requiredFiles = [
    'src/lib/huggingface/HuggingFaceDatasetUploader.ts',
    'src/lib/huggingface/HuggingFaceModelUploader.ts',
    'src/lib/huggingface/HuggingFaceIntegrationService.ts',
    'src/lib/benchmark/ModelBenchmarkService.ts',
    'src/app/api/cron/weekly-dataset-upload/route.ts',
    'scripts/upload-dataset-to-huggingface.ts',
    'scripts/upload-model-to-huggingface.ts',
    'scripts/benchmark-rl-model.ts',
    'scripts/test-huggingface-integration.ts',
    'scripts/generate-standard-benchmarks.ts',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    
    if (exists) {
      console.log(`   ✅ ${file}`);
    } else {
      addIssue('error', 'Files', `Missing file: ${file}`, 'Regenerate files or check git status');
    }
  }

  // Check documentation
  const docs = [
    'HUGGINGFACE_INTEGRATION.md',
    'HUGGINGFACE_QUICKSTART.md',
    'HUGGINGFACE_COMPLETE_IMPLEMENTATION.md',
    'DEPLOYMENT_CHECKLIST_HUGGINGFACE.md',
  ];

  for (const doc of docs) {
    const docPath = path.join(process.cwd(), doc);
    const exists = await fs.access(docPath).then(() => true).catch(() => false);
    
    if (!exists) {
      addIssue('warning', 'Documentation', `Missing documentation: ${doc}`);
    }
  }
}

async function validateIntegrationService(): Promise<void> {
  console.log('\n🔧 Validating Integration Service...');

  try {
    const validation = await huggingFaceIntegration.validateSystemReadiness();
    
    if (validation.ready) {
      console.log('   ✅ System ready for HuggingFace operations');
    } else {
      console.log('   ⚠️  System not ready');
      validation.issues.forEach(issue => {
        addIssue('error', 'Integration', issue);
      });
    }

    validation.warnings.forEach(warning => {
      addIssue('warning', 'Integration', warning);
    });

    // Get statistics
    const stats = await huggingFaceIntegration.getStatistics();
    console.log(`\n   📊 Current Statistics:`);
    console.log(`      Benchmarks: ${stats.benchmarks.total} (last: ${stats.benchmarks.lastUpload?.toISOString().split('T')[0] || 'never'})`);
    console.log(`      Trajectories: ${stats.trajectories.training} training / ${stats.trajectories.total} total`);
    console.log(`      Models: ${stats.models.benchmarked}/${stats.models.total} benchmarked, ${stats.models.deployed} on HuggingFace`);
    console.log(`      HuggingFace: ${stats.huggingface.modelsPublished} models published`);

    // Check for new data
    const newData = await huggingFaceIntegration.hasNewDataToUpload();
    if (newData.hasNewBenchmarks || newData.hasNewTrajectories || newData.hasUnbenchmarkedModels) {
      console.log(`\n   📦 New Data Available:`);
      if (newData.hasNewBenchmarks) console.log(`      - New benchmarks since ${newData.details.newBenchmarksSince?.toISOString().split('T')[0]}`);
      if (newData.hasNewTrajectories) console.log(`      - ${newData.details.newTrajectoriesCount} new trajectories`);
      if (newData.hasUnbenchmarkedModels) console.log(`      - ${newData.details.unbenchmarkedModels} unbenchmarked models`);
    }
  } catch (error) {
    addIssue('error', 'Integration', 'Integration service validation failed: ' + (error instanceof Error ? error.message : String(error)));
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     HUGGINGFACE INTEGRATION VALIDATION                 ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  await validateEnvironment();
  await validateDatabase();
  await validateBenchmarks();
  await validateFileStructure();
  await validateIntegrationService();

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 VALIDATION SUMMARY           ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  console.log(`Total Issues Found: ${issues.length}`);
  console.log(`   ❌ Errors: ${errors.length}`);
  console.log(`   ⚠️  Warnings: ${warnings.length}`);
  console.log(`   ℹ️  Info: ${infos.length}\n`);

  if (errors.length > 0) {
    console.log('❌ ERRORS (must fix before deployment):\n');
    errors.forEach(issue => {
      console.log(`   ${issue.category}: ${issue.message}`);
      if (issue.fix) {
        console.log(`      Fix: ${issue.fix}`);
      }
    });
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS (recommended to fix):\n');
    warnings.forEach(issue => {
      console.log(`   ${issue.category}: ${issue.message}`);
      if (issue.fix) {
        console.log(`      Fix: ${issue.fix}`);
      }
    });
    console.log('');
  }

  if (infos.length > 0) {
    console.log('ℹ️  INFO (for your awareness):\n');
    infos.forEach(issue => {
      console.log(`   ${issue.category}: ${issue.message}`);
      if (issue.fix) {
        console.log(`      Note: ${issue.fix}`);
      }
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (errors.length === 0) {
    console.log('✅ SYSTEM READY FOR DEPLOYMENT!\n');
    console.log('Next steps:');
    console.log('1. Review any warnings above');
    console.log('2. Test manually: bun run hf:test');
    console.log('3. Generate standard benchmarks: npx ts-node scripts/generate-standard-benchmarks.ts');
    console.log('4. Deploy to production');
    console.log('5. Monitor first CRON run\n');
    process.exit(0);
  } else {
    console.log('❌ SYSTEM NOT READY - Fix errors above before deploying\n');
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('\n💥 Validation failed:', error);
  await db.$disconnect();
  process.exit(1);
});



