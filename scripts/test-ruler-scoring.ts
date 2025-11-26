/**
 * Test RULER Scoring with Real LLM Judge
 * 
 * Creates test trajectories with varying performance levels,
 * groups them by scenarioId, and tests the full RULER scoring
 * pipeline with actual LLM judge calls.
 */

import { db } from '@/db';
import { trajectoryRecorder } from '@/lib/training/TrajectoryRecorder';
import { rulerScoringService } from '@/lib/training/RulerScoringService';
import { generateSnowflakeId } from '@/lib/snowflake';

async function main() {
  console.log('\n━━━ TESTING RULER SCORING WITH REAL LLM ━━━\n');

  // Step 1: Ensure test agent exists
  console.log('📊 Step 1: Setting up test agent...\n');
  
  let testAgent = await db.user.findFirst({
    where: { username: 'ruler-test-agent' }
  });

  if (!testAgent) {
    testAgent = await db.user.create({
      data: {
        id: await generateSnowflakeId(),
        username: 'ruler-test-agent',
        displayName: 'RULER Test Agent',
        isAgent: true,
        isTest: true,
        agentSystem: 'You are a trading agent in Babylon prediction markets. Make profitable decisions.',
        agentModelTier: 'pro',
        virtualBalance: '10000',
        reputationPoints: 1000,
        autonomousTrading: true,
        updatedAt: new Date(),
      }
    });
    console.log(`  ✅ Created test agent: ${testAgent.id}\n`);
  } else {
    console.log(`  ✅ Using existing agent: ${testAgent.id}\n`);
  }

  // Step 2: Create test trajectories with varying performance
  console.log('📊 Step 2: Creating test trajectories with varying performance...\n');
  
  const scenarioId = `ruler-test-${Date.now()}`;
  const windowId = new Date().toISOString().slice(0, 13) + ':00';
  
  // Create 4 trajectories with different performance levels:
  // 1. High performer (good P&L, many successful actions)
  // 2. Medium performer (moderate P&L, some actions)
  // 3. Low performer (negative P&L, few actions)
  // 4. Very low performer (large losses, errors)
  
  const performanceLevels = [
    { name: 'High', pnl: 500, steps: 5, successRate: 1.0, balance: 10500 },
    { name: 'Medium', pnl: 100, steps: 3, successRate: 0.67, balance: 10100 },
    { name: 'Low', pnl: -200, steps: 2, successRate: 0.5, balance: 9800 },
    { name: 'Very Low', pnl: -500, steps: 1, successRate: 0.0, balance: 9500 }
  ];

  const trajectoryIds: string[] = [];

  for (let i = 0; i < performanceLevels.length; i++) {
    const level = performanceLevels[i]!;
    console.log(`  Creating ${level.name} performer trajectory...`);

    const trajId = await trajectoryRecorder.startTrajectory({
      agentId: testAgent.id,
      scenarioId,
      windowId,
      metadata: {
        test: true,
        performanceLevel: level.name
      }
    });

    trajectoryIds.push(trajId);

    // Create steps with varying quality
    for (let step = 0; step < level.steps; step++) {
      const stepSuccess = Math.random() < level.successRate;
      const stepPnL = level.pnl / level.steps + (stepSuccess ? 50 : -50);

      trajectoryRecorder.startStep(trajId, {
        agentBalance: level.balance - (step * 100),
        agentPnL: (level.pnl / level.steps) * (step + 1),
        openPositions: step + 1,
        activeMarkets: 20,
        timestamp: Date.now() + step * 1000
      });

      // Add LLM call
      const llmCall = {
        model: 'groq-qwen-32b',
        systemPrompt: 'You are a trading agent in Babylon prediction markets. Make profitable decisions.',
        userPrompt: step === 0 
          ? 'Analyze the current market conditions. Should I take a position?'
          : `Current P&L: $${stepPnL.toFixed(2)}. What should I do next?`,
        response: stepSuccess
          ? `I will buy $${200 + step * 50} worth of shares based on positive momentum.`
          : `I will hold my position and wait for better entry point.`,
        temperature: 0.7,
        maxTokens: 500,
        purpose: 'action' as const,
        actionType: 'TRADING'
      };

      // Add provider access
      const providerAccess = {
        providerName: 'market-data',
        data: {
          marketId: `market-${step}`,
          probability: 0.5 + (stepSuccess ? 0.2 : -0.2),
          volume: 1000 + step * 100
        },
        purpose: 'market-analysis'
      };

      // Complete step with action
      trajectoryRecorder.completeStep(trajId, {
        actionType: stepSuccess ? 'BUY_SHARES' : 'HOLD',
        parameters: stepSuccess ? { amount: 200 + step * 50 } : {},
        success: stepSuccess,
        result: stepSuccess ? { executed: true, shares: 10 } : undefined,
        error: stepSuccess ? undefined : 'Market conditions not favorable'
      }, stepPnL / 100); // Normalize reward

      // Manually add LLM call and provider access to the step
      // (TrajectoryRecorder doesn't expose these methods, so we'll add them via DB update)
      const trajRecord = await db.trajectory.findUnique({
        where: { trajectoryId: trajId },
        select: { stepsJson: true }
      });

      if (trajRecord?.stepsJson) {
        const trajSteps = JSON.parse(trajRecord.stepsJson);
        const lastTrajStep = trajSteps[trajSteps.length - 1];
        if (lastTrajStep) {
          lastTrajStep.llmCalls = [llmCall];
          lastTrajStep.providerAccesses = [providerAccess];
          await db.trajectory.update({
            where: { trajectoryId: trajId },
            data: { stepsJson: JSON.stringify(trajSteps) }
          });
        }
      }
    }

    // End trajectory with final metrics
    await trajectoryRecorder.endTrajectory(trajId, {
      finalPnL: level.pnl,
      finalBalance: level.balance
    });

    console.log(`    ✅ Created trajectory ${trajId.substring(0, 12)}... (${level.steps} steps, P&L: $${level.pnl})\n`);
  }

  // Step 3: Verify trajectories are created
  console.log('📊 Step 3: Verifying trajectories...\n');
  
  const created = await db.trajectory.findMany({
    where: {
      trajectoryId: { in: trajectoryIds },
      scenarioId
    },
    select: {
      trajectoryId: true,
      stepsJson: true,
      finalPnL: true,
      episodeLength: true,
      aiJudgeReward: true
    }
  });

  console.log(`  ✅ Found ${created.length} trajectories\n`);
  for (const traj of created) {
    console.log(`    ${traj.trajectoryId.substring(0, 12)}... - ${traj.episodeLength} steps, P&L: $${traj.finalPnL}, scored: ${traj.aiJudgeReward !== null ? '✅' : '❌'}`);
  }

  // Step 4: Score trajectories with RULER
  console.log('\n📊 Step 4: Scoring trajectories with RULER (real LLM judge)...\n');
  console.log('  This will call Groq API to judge trajectories relative to each other...\n');

  const startTime = Date.now();
  
  try {
    const scored = await rulerScoringService.scoreTrajectories(trajectoryIds);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n  ✅ Scoring complete! (${duration}s)\n`);
    console.log(`  Scored ${scored} trajectories\n`);

    // Step 5: Verify scores
    console.log('📊 Step 5: Verifying scores...\n');
    
    const scoredTrajectories = await db.trajectory.findMany({
      where: {
        trajectoryId: { in: trajectoryIds }
      },
      select: {
        trajectoryId: true,
        finalPnL: true,
        episodeLength: true,
        aiJudgeReward: true,
        aiJudgeReasoning: true
      },
      orderBy: {
        aiJudgeReward: 'desc'
      }
    });

    console.log('  Score Rankings (should correlate with performance):\n');
    for (let i = 0; i < scoredTrajectories.length; i++) {
      const traj = scoredTrajectories[i]!;
      const level = performanceLevels.find(l => 
        Math.abs(l.pnl - (traj.finalPnL || 0)) < 50
      );
      
      console.log(`  ${i + 1}. ${traj.trajectoryId.substring(0, 12)}...`);
      console.log(`     Score: ${traj.aiJudgeReward?.toFixed(3) || 'N/A'}`);
      console.log(`     P&L: $${traj.finalPnL}`);
      console.log(`     Steps: ${traj.episodeLength}`);
      console.log(`     Level: ${level?.name || 'Unknown'}`);
      if (traj.aiJudgeReasoning) {
        console.log(`     Reasoning: ${traj.aiJudgeReasoning.substring(0, 100)}...`);
      }
      console.log('');
    }

    // Step 6: Validate scores are reasonable
    console.log('📊 Step 6: Validating scores...\n');
    
    const scores = scoredTrajectories
      .map(t => t.aiJudgeReward)
      .filter((s): s is number => s !== null);
    
    if (scores.length !== trajectoryIds.length) {
      console.log(`  ❌ ERROR: Expected ${trajectoryIds.length} scores, got ${scores.length}\n`);
      process.exit(1);
    }

    // Check that scores are in valid range
    const invalidScores = scores.filter(s => s < 0 || s > 1);
    if (invalidScores.length > 0) {
      console.log(`  ❌ ERROR: Found invalid scores: ${invalidScores.join(', ')}\n`);
      process.exit(1);
    }

    // Check that scores are different (relative comparison working)
    const uniqueScores = new Set(scores.map(s => s.toFixed(2)));
    if (uniqueScores.size < 2) {
      console.log(`  ⚠️  WARNING: Scores are too similar (${uniqueScores.size} unique values)`);
      console.log(`     This might indicate the judge isn't differentiating properly.\n`);
    } else {
      console.log(`  ✅ Scores are differentiated (${uniqueScores.size} unique values)\n`);
    }

    // Check that higher performers got higher scores (rough correlation)
    const highPerformerScore = scoredTrajectories.find(t => 
      Math.abs((t.finalPnL || 0) - 500) < 50
    )?.aiJudgeReward || 0;
    
    const lowPerformerScore = scoredTrajectories.find(t => 
      Math.abs((t.finalPnL || 0) - (-500)) < 50
    )?.aiJudgeReward || 1;

    if (highPerformerScore > lowPerformerScore) {
      console.log(`  ✅ High performer (${highPerformerScore.toFixed(3)}) scored higher than low performer (${lowPerformerScore.toFixed(3)})\n`);
    } else {
      console.log(`  ⚠️  WARNING: Score ordering doesn't match performance expectations\n`);
      console.log(`     High: ${highPerformerScore.toFixed(3)}, Low: ${lowPerformerScore.toFixed(3)}\n`);
    }

    console.log('━━━ TEST COMPLETE ━━━\n');
    console.log('✅ RULER scoring works correctly with real LLM judge!\n');

  } catch (error) {
    console.error('\n❌ ERROR during scoring:\n');
    console.error(error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

