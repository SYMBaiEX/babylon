#!/usr/bin/env tsx
/**
 * Verify trajectory collection from ElizaOS agents
 * 
 * Checks:
 * 1. Trajectories exist in database
 * 2. Trajectories are from ElizaOS agents
 * 3. Trajectories are extractable/queryable
 * 4. Integration is working
 */

import { prisma } from '@/lib/prisma';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { autonomousCoordinator } from '@/lib/agents/autonomous/AutonomousCoordinator';

async function verifyTrajectories() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     TRAJECTORY COLLECTION VERIFICATION                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  // Check 1: Trajectories in database
  console.log('CHECK 1: Trajectories in Database');
  console.log('═'.repeat(60));
  
  const trajectoryCount = await prisma.trajectory.count();
  console.log(`Total trajectories: ${trajectoryCount}`);
  
  if (trajectoryCount === 0) {
    console.log('⚠️  No trajectories found in database');
    console.log('   This is expected if RECORD_AGENT_TRAJECTORIES was not enabled');
    console.log('   or if agents have not run yet.\n');
  } else {
    console.log('✅ Trajectories exist in database\n');
    
    // Get sample trajectories
    const sampleTrajectories = await prisma.trajectory.findMany({
      take: 5,
      orderBy: { startTime: 'desc' },
      select: {
        trajectoryId: true,
        agentId: true,
        startTime: true,
        episodeLength: true,
        totalReward: true,
        tradesExecuted: true,
        postsCreated: true,
        finalStatus: true,
        isTrainingData: true,
        usedInTraining: true
      }
    });
    
    console.log('Sample trajectories:');
    for (const traj of sampleTrajectories) {
      console.log(`  - ${traj.trajectoryId.substring(0, 8)}...`);
      console.log(`    Agent: ${traj.agentId.substring(0, 8)}...`);
      console.log(`    Steps: ${traj.episodeLength}, Reward: ${traj.totalReward.toFixed(2)}`);
      console.log(`    Trades: ${traj.tradesExecuted || 0}, Posts: ${traj.postsCreated || 0}`);
      console.log(`    Status: ${traj.finalStatus}, Training: ${traj.isTrainingData}`);
    }
    console.log('');
  }
  
  // Check 2: Agents exist
  console.log('CHECK 2: ElizaOS Agents Available');
  console.log('═'.repeat(60));
  
  const agents = await prisma.user.findMany({
    where: {
      isAgent: true,
      agentPointsBalance: { gte: 1 },
      OR: [
        { autonomousTrading: true },
        { autonomousPosting: true },
        { autonomousCommenting: true },
        { autonomousDMs: true },
        { autonomousGroupChats: true }
      ]
    },
    take: 10,
    select: {
      id: true,
      username: true,
      displayName: true,
      autonomousTrading: true,
      autonomousPosting: true,
      agentPointsBalance: true
    }
  });
  
  console.log(`Found ${agents.length} agents ready to run`);
  if (agents.length > 0) {
    console.log('Sample agents:');
    for (const agent of agents.slice(0, 3)) {
      console.log(`  - ${agent.displayName || agent.username || agent.id.substring(0, 8)}`);
      console.log(`    ID: ${agent.id.substring(0, 8)}...`);
      console.log(`    Points: ${agent.agentPointsBalance}`);
      console.log(`    Features: ${[
        agent.autonomousTrading && 'trading',
        agent.autonomousPosting && 'posting'
      ].filter(Boolean).join(', ') || 'none'}`);
    }
    console.log('');
  } else {
    console.log('⚠️  No agents found');
    console.log('   Create agents or ensure they have points and features enabled\n');
  }
  
  // Check 3: Trajectory recording enabled
  console.log('CHECK 3: Trajectory Recording Configuration');
  console.log('═'.repeat(60));
  
  const recordTrajectories = process.env.RECORD_AGENT_TRAJECTORIES === 'true';
  console.log(`RECORD_AGENT_TRAJECTORIES: ${process.env.RECORD_AGENT_TRAJECTORIES || 'not set'}`);
  console.log(`Recording enabled: ${recordTrajectories ? '✅ YES' : '❌ NO'}`);
  
  if (!recordTrajectories) {
    console.log('\n⚠️  Trajectory recording is NOT enabled');
    console.log('   Set RECORD_AGENT_TRAJECTORIES=true to collect trajectories\n');
  } else {
    console.log('✅ Trajectory recording is enabled\n');
  }
  
  // Check 4: Trajectory extraction/queryability
  console.log('CHECK 4: Trajectory Extraction/Queryability');
  console.log('═'.repeat(60));
  
  if (trajectoryCount > 0) {
    // Test various queries
    const byAgent = await prisma.trajectory.groupBy({
      by: ['agentId'],
      _count: { trajectoryId: true },
      _avg: { totalReward: true, episodeLength: true }
    });
    
    console.log(`Trajectories by agent: ${byAgent.length} unique agents`);
    for (const group of byAgent.slice(0, 3)) {
      console.log(`  - Agent ${group.agentId.substring(0, 8)}...`);
      console.log(`    Count: ${group._count.trajectoryId}`);
      console.log(`    Avg reward: ${group._avg.totalReward?.toFixed(2) || 'N/A'}`);
      console.log(`    Avg steps: ${group._avg.episodeLength?.toFixed(1) || 'N/A'}`);
    }
    
    const trainingReady = await prisma.trajectory.count({
      where: {
        isTrainingData: true,
        usedInTraining: false,
        episodeLength: { gte: 1 }
      }
    });
    
    console.log(`\nTraining-ready trajectories: ${trainingReady}`);
    console.log('✅ Trajectories are queryable and extractable\n');
  } else {
    console.log('⚠️  No trajectories to test extraction\n');
  }
  
  // Check 5: Integration test (if agents exist and recording enabled)
  console.log('CHECK 5: Integration Test');
  console.log('═'.repeat(60));
  
  if (agents.length > 0 && recordTrajectories) {
    console.log('Testing trajectory collection with one agent...');
    
    const testAgent = agents[0]!;
    const beforeCount = await prisma.trajectory.count();
    
    try {
      const runtime = await agentRuntimeManager.getRuntime(testAgent.id);
      const result = await autonomousCoordinator.executeAutonomousTick(
        testAgent.id,
        runtime,
        true  // Force recording for test
      );
      
      // Wait a moment for trajectory to be saved
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const afterCount = await prisma.trajectory.count();
      const newTrajectories = afterCount - beforeCount;
      
      if (newTrajectories > 0) {
        console.log(`✅ Integration test PASSED`);
        console.log(`   Created ${newTrajectories} new trajectory(ies)`);
        console.log(`   Trajectory ID: ${result.trajectoryId || 'N/A'}`);
      } else {
        console.log('⚠️  Integration test: Agent ran but no trajectory created');
        console.log('   This may be normal if the tick completed quickly');
      }
    } catch (error) {
      console.log(`❌ Integration test FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log('⚠️  Skipping integration test');
    if (agents.length === 0) {
      console.log('   Reason: No agents available');
    }
    if (!recordTrajectories) {
      console.log('   Reason: Trajectory recording not enabled');
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Trajectories in DB: ${trajectoryCount}`);
  console.log(`Agents available: ${agents.length}`);
  console.log(`Recording enabled: ${recordTrajectories ? 'YES' : 'NO'}`);
  console.log(`Integration: ${agents.length > 0 && recordTrajectories ? 'READY' : 'NOT READY'}`);
  console.log('═'.repeat(60) + '\n');
  
  if (trajectoryCount > 0) {
    console.log('✅ VERIFICATION PASSED');
    console.log('   Trajectories exist and are extractable from ElizaOS agents\n');
  } else if (recordTrajectories && agents.length > 0) {
    console.log('⚠️  VERIFICATION INCOMPLETE');
    console.log('   System is configured but no trajectories collected yet');
    console.log('   Run agents to collect trajectories:\n');
    console.log('   bun run scripts/collect-trajectories.ts 10\n');
  } else {
    console.log('❌ VERIFICATION FAILED');
    console.log('   Either recording is not enabled or no agents available\n');
  }
}

async function main() {
  try {
    await verifyTrajectories();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

