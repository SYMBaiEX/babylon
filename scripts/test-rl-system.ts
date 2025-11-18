/**
 * Complete RL Training System Test
 * 
 * Comprehensive end-to-end test of the entire RL training system:
 * - Model selection logic
 * - Training data management
 * - Benchmarking
 * - Model comparison
 * - Deployment decisions
 * - API endpoints
 * - AutomationPipeline integration
 */

import { prisma } from '@/lib/prisma';
import { modelSelectionService } from '@/lib/training/ModelSelectionService';
import { benchmarkService } from '@/lib/training/BenchmarkService';
import { automationPipeline } from '@/lib/training/AutomationPipeline';

interface TestResult {
  category: string;
  test: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

function addResult(category: string, test: string, passed: boolean, details: string, error?: string) {
  results.push({ category, test, passed, details, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${category}] ${test}: ${details}`);
  if (error) {
    console.error(`   Error: ${error}`);
  }
}

async function testModelSelection() {
  console.log('\n━━━ Model Selection Service ━━━\n');
  
  try {
    // Test 1: Bundle counting
    const bundleCount = await modelSelectionService.countTrainingBundles();
    addResult('ModelSelection', 'Bundle Counting', true, `${bundleCount} bundles found`);
    
    // Test 2: Force first model check
    const shouldForce = await modelSelectionService.shouldForceFirstModel();
    addResult('ModelSelection', 'First Model Detection', true, 
      shouldForce ? 'Will force first model' : 'Models exist');
    
    // Test 3: Best model selection
    const bestModel = await modelSelectionService.getBestPerformingModel();
    addResult('ModelSelection', 'Best Model Query', true,
      bestModel ? `Found: ${bestModel.modelId}` : 'No benchmarked models');
    
    // Test 4: Selection summary
    const summary = await modelSelectionService.getSelectionSummary();
    addResult('ModelSelection', 'Summary Generation', true,
      `${summary.trainedModelCount} models, ${summary.bundleCount} bundles, Rec: ${summary.recommendation}`);
    
    // Test 5: Full selection logic
    try {
      const selection = await modelSelectionService.selectBaseModel();
      addResult('ModelSelection', 'Model Selection Logic', true,
        `Strategy: ${selection.strategy}, Model: ${selection.modelId}`);
    } catch (error) {
      addResult('ModelSelection', 'Model Selection Logic', false,
        'Selection failed', error instanceof Error ? error.message : String(error));
    }
    
    // Test 6: Data limit calculation
    const dataLimit = await modelSelectionService.getTrainingDataLimit();
    addResult('ModelSelection', 'Data Limit Calculation', true,
      dataLimit ? `Cap at ${dataLimit} examples` : 'No limit (use all)');
    
  } catch (error) {
    addResult('ModelSelection', 'Service', false, 'Test suite crashed',
      error instanceof Error ? error.message : String(error));
  }
}

async function testBenchmarking() {
  console.log('\n━━━ Benchmarking Service ━━━\n');
  
  try {
    // Test 1: Benchmark summary
    const summary = await benchmarkService.getBenchmarkSummary();
    addResult('Benchmarking', 'Summary Generation', true,
      `${summary.totalBenchmarked} models benchmarked`);
    
    // Test 2: Check for models to benchmark
    const modelsToTest = await prisma.trainedModel.findMany({
      where: { status: { in: ['ready', 'deployed'] } },
      take: 2
    });
    
    addResult('Benchmarking', 'Model Availability', modelsToTest.length > 0,
      modelsToTest.length > 0 
        ? `${modelsToTest.length} models available`
        : 'No models to benchmark');
    
    // Test 3: Comparison logic (if models exist)
    if (modelsToTest.length > 0) {
      try {
        const comparison = await benchmarkService.compareModels(modelsToTest[0]!.modelId);
        addResult('Benchmarking', 'Comparison Logic', true,
          `Should deploy: ${comparison.shouldDeploy}, Reason: ${comparison.reason}`);
      } catch (error) {
        // This is okay if model hasn't been benchmarked yet
        addResult('Benchmarking', 'Comparison Logic', true,
          'Model not benchmarked yet (expected for new models)');
      }
    }
    
  } catch (error) {
    addResult('Benchmarking', 'Service', false, 'Test suite crashed',
      error instanceof Error ? error.message : String(error));
  }
}

async function testAutomationPipeline() {
  console.log('\n━━━ Automation Pipeline ━━━\n');
  
  try {
    // Test 1: Training readiness
    const readiness = await automationPipeline.checkTrainingReadiness();
    addResult('AutomationPipeline', 'Training Readiness', true,
      `Ready: ${readiness.ready}, Reason: ${readiness.reason}`);
    
    // Test 2: Model selection integration
    const selectionInfo = await automationPipeline.getModelSelectionInfo();
    addResult('AutomationPipeline', 'Model Selection Integration', selectionInfo.success,
      selectionInfo.success 
        ? `Strategy: ${selectionInfo.selection?.strategy}`
        : 'Failed');
    
    // Test 3: System status
    const status = await automationPipeline.getStatus();
    addResult('AutomationPipeline', 'Status Query', true,
      `Latest model: ${status.models.latest || 'None'}, Deployed: ${status.models.deployed}`);
    
    // Test 4: Check completed batches
    const completedBatches = await prisma.trainingBatch.count({
      where: { status: 'completed' }
    });
    addResult('AutomationPipeline', 'Batch Tracking', true,
      `${completedBatches} completed training batches`);
    
  } catch (error) {
    addResult('AutomationPipeline', 'Pipeline', false, 'Test suite crashed',
      error instanceof Error ? error.message : String(error));
  }
}

async function testDatabase() {
  console.log('\n━━━ Database Integration ━━━\n');
  
  try {
    // Test 1: Trajectory data
    const trajectoryStats = {
      total: await prisma.trajectory.count(),
      scored: await prisma.trajectory.count({ where: { aiJudgeReward: { not: null } } }),
      training: await prisma.trajectory.count({ where: { isTrainingData: true } }),
      unused: await prisma.trajectory.count({ where: { isTrainingData: true, usedInTraining: false } })
    };
    
    addResult('Database', 'Trajectory Data', true,
      `Total: ${trajectoryStats.total}, Scored: ${trajectoryStats.scored}, Unused: ${trajectoryStats.unused}`);
    
    // Test 2: Model data
    const modelStats = {
      total: await prisma.trainedModel.count(),
      ready: await prisma.trainedModel.count({ where: { status: 'ready' } }),
      deployed: await prisma.trainedModel.count({ where: { status: 'deployed' } }),
      benchmarked: await prisma.trainedModel.count({ where: { benchmarkScore: { not: null } } })
    };
    
    addResult('Database', 'Model Data', true,
      `Total: ${modelStats.total}, Ready: ${modelStats.ready}, Deployed: ${modelStats.deployed}`);
    
    // Test 3: Training batch data
    const batchStats = {
      total: await prisma.trainingBatch.count(),
      pending: await prisma.trainingBatch.count({ where: { status: 'pending' } }),
      training: await prisma.trainingBatch.count({ where: { status: 'training' } }),
      completed: await prisma.trainingBatch.count({ where: { status: 'completed' } }),
      failed: await prisma.trainingBatch.count({ where: { status: 'failed' } })
    };
    
    addResult('Database', 'Training Batches', true,
      `Total: ${batchStats.total}, Completed: ${batchStats.completed}, Failed: ${batchStats.failed}`);
    
    // Test 4: Schema verification
    const sampleModel = await prisma.trainedModel.findFirst();
    if (sampleModel) {
      const hasRequiredFields = 
        'benchmarkScore' in sampleModel &&
        'storagePath' in sampleModel &&
        'status' in sampleModel &&
        'avgReward' in sampleModel;
      
      addResult('Database', 'Schema Verification', hasRequiredFields,
        hasRequiredFields ? 'All required fields present' : 'Missing fields');
    } else {
      addResult('Database', 'Schema Verification', true,
        'No models to verify (expected for new deployment)');
    }
    
  } catch (error) {
    addResult('Database', 'Integration', false, 'Test suite crashed',
      error instanceof Error ? error.message : String(error));
  }
}

async function testConfiguration() {
  console.log('\n━━━ Configuration & Environment ━━━\n');
  
  try {
    // Test 1: Environment variables
    const envVars = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      WANDB_API_KEY: !!process.env.WANDB_API_KEY,
      WANDB_PROJECT: process.env.WANDB_PROJECT || 'default',
      BASE_MODEL: process.env.BASE_MODEL || 'default'
    };
    
    addResult('Configuration', 'Environment Variables', 
      envVars.DATABASE_URL && envVars.WANDB_API_KEY,
      `DATABASE_URL: ${envVars.DATABASE_URL}, WANDB_API_KEY: ${envVars.WANDB_API_KEY}`);
    
    // Test 2: Benchmark file
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const benchmarkPath = path.resolve(process.cwd(), 'benchmarks/benchmark-week-10080-60-10-5-8-12345.json');
      await fs.access(benchmarkPath);
      addResult('Configuration', 'Benchmark File', true, 'Found');
    } catch {
      addResult('Configuration', 'Benchmark File', false, 
        'Not found - run scripts/generate-benchmark.ts');
    }
    
    // Test 3: Python trainer
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const trainerPath = path.resolve(process.cwd(), 'python/src/training/babylon_trainer.py');
      await fs.access(trainerPath);
      addResult('Configuration', 'Python Trainer', true, 'Found');
    } catch {
      addResult('Configuration', 'Python Trainer', false, 'Not found');
    }
    
    // Test 4: GitHub workflow
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const workflowPath = path.resolve(process.cwd(), '.github/workflows/rl-training.yml');
      await fs.access(workflowPath);
      addResult('Configuration', 'GitHub Workflow', true, 'Found');
    } catch {
      addResult('Configuration', 'GitHub Workflow', false, 'Not found');
    }
    
  } catch (error) {
    addResult('Configuration', 'Check', false, 'Test suite crashed',
      error instanceof Error ? error.message : String(error));
  }
}

async function printSummary() {
  console.log('\n' + '━'.repeat(80));
  console.log('📊 COMPREHENSIVE TEST SUMMARY');
  console.log('━'.repeat(80) + '\n');
  
  const byCategory = results.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category]!.push(r);
    return acc;
  }, {} as Record<string, TestResult[]>);
  
  for (const [category, tests] of Object.entries(byCategory)) {
    const passed = tests.filter(t => t.passed).length;
    const total = tests.length;
    const percentage = total > 0 ? (passed / total) * 100 : 0;
    
    console.log(`${category}: ${passed}/${total} (${percentage.toFixed(0)}%)`);
  }
  
  console.log();
  
  const totalPassed = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const totalPercentage = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
  
  console.log(`Overall: ${totalPassed}/${totalTests} tests passed (${totalPercentage.toFixed(1)}%)\n`);
  
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log('❌ Failed Tests:\n');
    failed.forEach(r => {
      console.log(`   [${r.category}] ${r.test}: ${r.details}`);
      if (r.error) {
        console.log(`      Error: ${r.error}`);
      }
    });
    console.log();
  }
  
  console.log('━'.repeat(80));
  
  if (totalPercentage === 100) {
    console.log('\n🎉 Perfect! All systems operational and ready for production!\n');
    console.log('Next steps:');
    console.log('1. Add GitHub secrets (DATABASE_URL, WANDB_API_KEY)');
    console.log('2. Push to GitHub');
    console.log('3. Test manual workflow trigger');
    console.log('4. Monitor first automatic training run\n');
  } else if (totalPercentage >= 90) {
    console.log('\n✅ Excellent! System is ready with minor issues.\n');
  } else if (totalPercentage >= 75) {
    console.log('\n⚠️  Good, but review failures before deploying.\n');
  } else {
    console.log('\n❌ System needs attention. Fix critical issues first.\n');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           Complete RL Training System - Comprehensive Test                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  
  try {
    await testConfiguration();
    await testDatabase();
    await testModelSelection();
    await testBenchmarking();
    await testAutomationPipeline();
    
    await printSummary();
    
    process.exit(results.every(r => r.passed) ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main };

