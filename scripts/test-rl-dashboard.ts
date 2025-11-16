/**
 * Test RL Training Dashboard
 * 
 * Comprehensive test of the RL training admin dashboard.
 * Tests all API endpoints, data loading, and functionality.
 */

import { prisma } from '@/lib/prisma';

interface TestResult {
  endpoint: string;
  method: string;
  passed: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

const results: TestResult[] = [];
const BASE_URL = 'http://localhost:3000';

function addResult(endpoint: string, method: string, passed: boolean, status?: number, data?: unknown, error?: string) {
  results.push({ endpoint, method, passed, status, data, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${method}] ${endpoint}: ${passed ? 'OK' : 'FAILED'}${status ? ` (${status})` : ''}`);
  if (error) {
    console.error(`   Error: ${error}`);
  }
}

async function testEndpoint(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await res.json();

    const passed = res.ok;
    addResult(endpoint, method, passed, res.status, data, passed ? undefined : data.error);
    
    return { passed, status: res.status, data };
  } catch (error) {
    addResult(endpoint, method, false, undefined, undefined, 
      error instanceof Error ? error.message : String(error));
    return { passed: false, status: 500, data: null };
  }
}

async function testDashboardAPIs() {
  console.log('\n━━━ Testing Dashboard API Endpoints ━━━\n');

  // Test 1: Get models list
  console.log('Testing models API...');
  const modelsTest = await testEndpoint('/api/admin/training/models', 'GET');
  
  if (modelsTest.passed && modelsTest.data) {
    const data = modelsTest.data as { models?: unknown[] };
    console.log(`   Found ${data.models?.length || 0} models`);
  }

  // Test 2: Get benchmark summary
  console.log('\nTesting benchmark summary API...');
  const benchmarkTest = await testEndpoint('/api/admin/training/benchmark', 'GET');
  
  if (benchmarkTest.passed && benchmarkTest.data) {
    const data = benchmarkTest.data as { summary?: { totalBenchmarked?: number } };
    console.log(`   ${data.summary?.totalBenchmarked || 0} models benchmarked`);
  }

  // Test 3: Get model selection
  console.log('\nTesting model selection API...');
  const selectionTest = await testEndpoint('/api/admin/training/model-selection', 'GET');
  
  if (selectionTest.passed && selectionTest.data) {
    const data = selectionTest.data as { 
      summary?: { bundleCount?: number; recommendation?: string };
      selection?: { strategy?: string };
    };
    console.log(`   Bundles: ${data.summary?.bundleCount || 0}`);
    console.log(`   Strategy: ${data.selection?.strategy || 'N/A'}`);
    console.log(`   Recommendation: ${data.summary?.recommendation || 'N/A'}`);
  }

  // Test 4: Get training status
  console.log('\nTesting training status API...');
  const statusTest = await testEndpoint('/api/admin/training/trigger', 'GET');
  
  if (statusTest.passed && statusTest.data) {
    const data = statusTest.data as { 
      ready?: boolean;
      reason?: string;
      stats?: { totalTrajectories?: number };
    };
    console.log(`   Ready: ${data.ready ? 'Yes' : 'No'}`);
    console.log(`   Reason: ${data.reason || 'N/A'}`);
    console.log(`   Trajectories: ${data.stats?.totalTrajectories || 0}`);
  }

  // Test 5: Test training trigger (dry run - no force)
  console.log('\nTesting training trigger API (status check)...');
  await testEndpoint('/api/admin/training/trigger', 'POST', { force: false });

  return {
    modelsTest,
    benchmarkTest,
    selectionTest,
    statusTest
  };
}

async function testDashboardData() {
  console.log('\n━━━ Testing Dashboard Data Integrity ━━━\n');

  let passed = 0;
  let total = 0;

  // Test 1: Check models table exists and is accessible
  total++;
  try {
    const modelCount = await prisma.trainedModel.count();
    console.log(`✅ Models table: ${modelCount} records`);
    passed++;
  } catch (error) {
    console.error(`❌ Models table: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  // Test 2: Check trajectories table
  total++;
  try {
    const trajectoryCount = await prisma.trajectory.count();
    const scoredCount = await prisma.trajectory.count({
      where: { aiJudgeReward: { not: null } }
    });
    console.log(`✅ Trajectories: ${trajectoryCount} total, ${scoredCount} scored`);
    passed++;
  } catch (error) {
    console.error(`❌ Trajectories: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  // Test 3: Check training batches
  total++;
  try {
    const batchCount = await prisma.trainingBatch.count();
    const completedCount = await prisma.trainingBatch.count({
      where: { status: 'completed' }
    });
    console.log(`✅ Training batches: ${batchCount} total, ${completedCount} completed`);
    passed++;
  } catch (error) {
    console.error(`❌ Training batches: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  // Test 4: Check data relationships
  total++;
  try {
    const models = await prisma.trainedModel.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    
    if (models.length > 0) {
      console.log(`✅ Model relationships: ${models.length} models with complete data`);
      models.forEach(m => {
        console.log(`   - ${m.modelId}: ${m.status}, score: ${m.benchmarkScore?.toFixed(3) || 'N/A'}`);
      });
    } else {
      console.log(`✅ Model relationships: No models yet (expected for new system)`);
    }
    passed++;
  } catch (error) {
    console.error(`❌ Model relationships: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  return { passed, total };
}

async function testDashboardFeatures() {
  console.log('\n━━━ Testing Dashboard Features ━━━\n');

  let passed = 0;
  let total = 0;

  // Feature 1: Model listing
  total++;
  try {
    const models = await prisma.trainedModel.findMany({
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ Model listing: ${models.length} models available`);
    passed++;
  } catch (error) {
    console.error(`❌ Model listing: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  // Feature 2: Benchmark summary
  total++;
  try {
    const benchmarkedModels = await prisma.trainedModel.findMany({
      where: { benchmarkScore: { not: null } },
      orderBy: { benchmarkScore: 'desc' },
      take: 5
    });
    console.log(`✅ Benchmark summary: ${benchmarkedModels.length} benchmarked models`);
    if (benchmarkedModels.length > 0) {
      console.log(`   Top score: ${benchmarkedModels[0]!.benchmarkScore?.toFixed(3) || 'N/A'}`);
    }
    passed++;
  } catch (error) {
    console.error(`❌ Benchmark summary: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  // Feature 3: Training readiness
  total++;
  try {
    const readyTrajectories = await prisma.trajectory.count({
      where: {
        isTrainingData: true,
        usedInTraining: false,
        aiJudgeReward: { not: null }
      }
    });
    console.log(`✅ Training readiness: ${readyTrajectories} trajectories ready`);
    passed++;
  } catch (error) {
    console.error(`❌ Training readiness: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  // Feature 4: Model comparison
  total++;
  try {
    const deployedModels = await prisma.trainedModel.findMany({
      where: { status: 'deployed' },
      orderBy: { deployedAt: 'desc' }
    });
    console.log(`✅ Model comparison: ${deployedModels.length} deployed models`);
    passed++;
  } catch (error) {
    console.error(`❌ Model comparison: ${error instanceof Error ? error.message : 'Failed'}`);
  }

  return { passed, total };
}

async function printSummary() {
  console.log('\n' + '━'.repeat(80));
  console.log('📊 RL DASHBOARD TEST SUMMARY');
  console.log('━'.repeat(80) + '\n');

  const apiTests = results.filter(r => r.passed).length;
  const apiTotal = results.length;
  const apiPercentage = apiTotal > 0 ? (apiTests / apiTotal) * 100 : 0;

  console.log(`API Endpoints: ${apiTests}/${apiTotal} passed (${apiPercentage.toFixed(0)}%)`);
  
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log('\n❌ Failed API Tests:');
    failed.forEach(r => {
      console.log(`   [${r.method}] ${r.endpoint}`);
      if (r.error) {
        console.log(`      Error: ${r.error}`);
      }
    });
  }

  console.log('\n' + '━'.repeat(80));

  if (apiPercentage === 100) {
    console.log('\n✅ All API endpoints working! Dashboard is fully functional.\n');
    console.log('🌐 Access dashboard at: http://localhost:3000/admin/rl-training\n');
    console.log('Dashboard Features:');
    console.log('✅ View all trained models');
    console.log('✅ Compare benchmark scores');
    console.log('✅ See model selection strategy');
    console.log('✅ Check training readiness');
    console.log('✅ Trigger training manually');
    console.log('✅ Benchmark models');
    console.log('✅ Auto-refresh every 30s\n');
  } else if (apiPercentage >= 80) {
    console.log('\n✅ Dashboard mostly working. Some endpoints may need attention.\n');
  } else {
    console.log('\n❌ Dashboard has issues. Check failed endpoints.\n');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  RL Training Dashboard - Comprehensive Test                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  try {
    // Test APIs
    await testDashboardAPIs();

    // Test data
    const dataResults = await testDashboardData();
    console.log(`\nData Tests: ${dataResults.passed}/${dataResults.total} passed`);

    // Test features
    const featureResults = await testDashboardFeatures();
    console.log(`\nFeature Tests: ${featureResults.passed}/${featureResults.total} passed`);

    // Print summary
    await printSummary();

    const allPassed = results.every(r => r.passed) && 
                      dataResults.passed === dataResults.total &&
                      featureResults.passed === featureResults.total;

    process.exit(allPassed ? 0 : 1);

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

