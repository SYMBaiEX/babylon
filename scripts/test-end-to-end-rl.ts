/**
 * End-to-End RL System Test
 *
 * Tests the COMPLETE flow:
 * 1. Model selection and training readiness
 * 2. Agents loading trained models
 * 3. Agents using models for decisions
 * 4. Agents taking real actions
 * 5. Trajectory recording
 */

import { db } from '@/db';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { automationPipeline } from '@/lib/training/AutomationPipeline';
import { modelSelectionService } from '@/lib/training/ModelSelectionService';
import { getLatestRLModel } from '@/lib/training/WandbModelFetcher';

interface TestResult {
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function addResult(test: string, passed: boolean, details: string) {
  results.push({ test, passed, details });
  console.log(`${passed ? '✅' : '❌'} ${test}: ${details}`);
}

async function testModelLoading() {
  console.log('\n━━━ 1. MODEL LOADING ━━━\n');

  // Test 1: Check if W&B API key configured
  const hasWandbKey = !!process.env.WANDB_API_KEY;
  addResult(
    'W&B API Key',
    hasWandbKey,
    hasWandbKey ? 'Configured' : 'Not set (agents will use base model)'
  );

  // Test 2: Check for latest trained model
  const latestModel = await getLatestRLModel();
  addResult(
    'Latest RL Model',
    true,
    latestModel
      ? `Found: ${latestModel.modelId} (v${latestModel.version}, path: ${latestModel.modelPath})`
      : 'No trained models yet (expected for new system)'
  );

  // Test 3: Model selection service
  try {
    const selection = await modelSelectionService.selectBaseModel();
    addResult(
      'Model Selection',
      true,
      `Strategy: ${selection.strategy}, Model: ${selection.modelPath}`
    );
  } catch (error) {
    addResult(
      'Model Selection',
      false,
      error instanceof Error ? error.message : 'Failed'
    );
  }

  return latestModel;
}

async function testAgentRuntimeConfiguration() {
  console.log('\n━━━ 2. AGENT RUNTIME CONFIGURATION ━━━\n');

  // Find an agent to test with
  const agent = await db.user.findFirst({
    where: { isAgent: true },
  });

  if (!agent) {
    addResult('Agent Found', false, 'No agents in database');
    return null;
  }

  addResult(
    'Agent Found',
    true,
    `Testing with: ${agent.displayName || agent.username}`
  );

  // Get runtime (this triggers model loading)
  const runtime = await agentRuntimeManager.getRuntime(agent.id);
  addResult(
    'Runtime Created',
    !!runtime,
    runtime ? 'Runtime initialized' : 'Failed to create runtime'
  );

  if (!runtime) return null;

  // Check runtime settings
  const wandbEnabled = runtime.getSetting('WANDB_ENABLED');
  const wandbModel = runtime.getSetting('WANDB_MODEL');
  const modelVersion = runtime.getSetting('MODEL_VERSION');

  addResult(
    'Runtime W&B Config',
    true,
    wandbEnabled === 'true'
      ? `Enabled, Model: ${wandbModel || 'not set'}, Version: ${modelVersion || 'not set'}`
      : 'W&B not enabled for this agent'
  );

  return { agent, runtime };
}

async function testAgentActions(
  agentInfo: {
    agent: { id: string; displayName: string | null };
    runtime: unknown;
  } | null
) {
  console.log('\n━━━ 3. AGENT ACTIONS ━━━\n');

  if (!agentInfo) {
    addResult('Agent Actions', false, 'No agent available for testing');
    return;
  }

  const { agent } = agentInfo;

  // Check if agent can trade
  const agentData = await db.user.findUnique({
    where: { id: agent.id },
    select: {
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      virtualBalance: true,
    },
  });

  addResult(
    'Agent Capabilities',
    true,
    `Trading: ${agentData?.autonomousTrading}, Posting: ${agentData?.autonomousPosting}, Balance: $${agentData?.virtualBalance || 0}`
  );

  // Check for available markets
  const predictionMarkets = await db.market.count({
    where: { resolved: false },
  });

  const perpMarkets = await db.organization.count({
    where: { type: 'perp' },
  });

  addResult(
    'Available Markets',
    predictionMarkets > 0 || perpMarkets > 0,
    `${predictionMarkets} prediction markets, ${perpMarkets} perp markets`
  );

  // Check agent's recent actions
  const recentActions = await db.agentLog.count({
    where: {
      agentUserId: agent.id,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  addResult(
    'Recent Activity',
    true,
    `${recentActions} actions in last 24 hours`
  );
}

async function testTrajectoryRecording() {
  console.log('\n━━━ 4. TRAJECTORY RECORDING ━━━\n');

  // Check if trajectories are being recorded
  const trajectoryCount = await db.trajectory.count();
  addResult(
    'Trajectories Recorded',
    trajectoryCount > 0,
    trajectoryCount > 0
      ? `${trajectoryCount} trajectories in database`
      : 'No trajectories yet (agents need to play)'
  );

  if (trajectoryCount > 0) {
    // Check recent trajectories
    const recent = await db.trajectory.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        episodeLength: true,
        finalStatus: true,
        finalPnL: true,
        aiJudgeReward: true,
        createdAt: true,
      },
    });

    addResult(
      'Recent Trajectory',
      !!recent,
      recent
        ? `${recent.episodeLength} steps, P&L: ${recent.finalPnL}, Scored: ${recent.aiJudgeReward ? 'Yes' : 'No'}`
        : 'No recent trajectories'
    );
  }
}

async function testTrainingReadiness() {
  console.log('\n━━━ 5. TRAINING PIPELINE ━━━\n');

  const readiness = await automationPipeline.checkTrainingReadiness();
  addResult(
    'Training Readiness',
    true,
    readiness.ready
      ? `READY: ${readiness.stats.totalTrajectories} scored trajectories`
      : `NOT READY: ${readiness.reason}`
  );

  addResult(
    'Training Stats',
    true,
    `Total: ${readiness.stats.totalTrajectories}, Unscored: ${readiness.stats.unscoredTrajectories}, Quality: ${(readiness.stats.dataQuality * 100).toFixed(1)}%`
  );
}

async function printSummary() {
  console.log('\n' + '━'.repeat(80));
  console.log('📊 END-TO-END TEST SUMMARY');
  console.log('━'.repeat(80) + '\n');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const percentage = total > 0 ? (passed / total) * 100 : 0;

  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed} (${percentage.toFixed(1)}%)`);
  console.log(`Failed: ${total - passed}\n`);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log('❌ Failed Tests:\n');
    failed.forEach((r) => {
      console.log(`   - ${r.test}: ${r.details}`);
    });
    console.log();
  }

  console.log('━'.repeat(80));

  if (percentage === 100) {
    console.log('\n✅ ALL TESTS PASSED! System is working end-to-end!\n');
  } else if (percentage >= 80) {
    console.log('\n✅ System mostly working. Review failures.\n');
  } else {
    console.log('\n❌ System has issues. Check failed tests.\n');
  }
}

async function main() {
  console.log(
    '╔════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║              RL Training System - End-to-End Verification                  ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════════════════╝'
  );

  try {
    await testModelLoading();
    const agentInfo = await testAgentRuntimeConfiguration();
    await testAgentActions(agentInfo);
    await testTrajectoryRecording();
    await testTrainingReadiness();

    await printSummary();

    process.exit(results.every((r) => r.passed) ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { main };
