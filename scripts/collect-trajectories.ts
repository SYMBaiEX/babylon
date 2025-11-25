#!/usr/bin/env tsx
/**
 * Easy script to collect trajectories for training
 * 
 * Usage:
 *   bun run scripts/collect-trajectories.ts [count]
 * 
 * Examples:
 *   bun run scripts/collect-trajectories.ts 10    # Collect 10 trajectories
 *   bun run scripts/collect-trajectories.ts 100   # Collect 100 trajectories
 */

import { db } from '@/db';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { autonomousCoordinator } from '@/lib/agents/autonomous/AutonomousCoordinator';

async function collectTrajectories(count: number = 10) {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        TRAJECTORY COLLECTION SCRIPT                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  // Check environment variable
  if (process.env.RECORD_AGENT_TRAJECTORIES !== 'true') {
    console.log('⚠️  WARNING: RECORD_AGENT_TRAJECTORIES is not set to "true"');
    console.log('   Trajectories will NOT be recorded!\n');
    console.log('   Set it with: export RECORD_AGENT_TRAJECTORIES=true\n');
  } else {
    console.log('✅ RECORD_AGENT_TRAJECTORIES=true (trajectories will be recorded)\n');
  }
  
  // Find agents
  const agents = await db.user.findMany({
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
    take: 10  // Limit to 10 agents max
  });
  
  if (agents.length === 0) {
    console.log('❌ No agents found!');
    console.log('\n   Agents need:');
    console.log('   - isAgent: true');
    console.log('   - agentPointsBalance >= 1');
    console.log('   - At least one autonomous feature enabled\n');
    console.log('   Create agents with: bun run scripts/spawn-test-agents.ts\n');
    process.exit(1);
  }
  
  console.log(`Found ${agents.length} agents\n`);
  console.log(`Collecting ${count} trajectories...\n`);
  
  const recordTrajectories = process.env.RECORD_AGENT_TRAJECTORIES === 'true';
  let trajectoriesCollected = 0;
  let errors = 0;
  
  // Get initial count
  const initialCount = await db.trajectory.count();
  console.log(`Current trajectories in database: ${initialCount}\n`);
  
  for (let i = 0; i < count; i++) {
    // Rotate through agents
    const agent = agents[i % agents.length]!;
    
    console.log(`[${i + 1}/${count}] Running agent: ${agent.username || agent.id}`);
    
    try {
      const runtime = await agentRuntimeManager.getRuntime(agent.id);
      const result = await autonomousCoordinator.executeAutonomousTick(
        agent.id,
        runtime,
        recordTrajectories
      );
      
      if (result.success) {
        console.log(`  ✅ Success - Actions: ${JSON.stringify(result.actionsExecuted)}`);
        if (result.trajectoryId) {
          console.log(`  📊 Trajectory ID: ${result.trajectoryId}`);
          trajectoriesCollected++;
        }
      } else {
        console.log(`  ⚠️  Completed but not successful`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      errors++;
    }
    
    // Small delay between runs
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Get final count
  const finalCount = await db.trajectory.count();
  const newTrajectories = finalCount - initialCount;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Trajectories collected: ${newTrajectories}`);
  console.log(`Successful runs: ${count - errors}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total trajectories in database: ${finalCount}`);
  console.log('═'.repeat(60) + '\n');
  
  if (newTrajectories > 0) {
    console.log('✅ Trajectories successfully collected!');
    console.log('   Ready for training when you have enough data.\n');
  } else if (recordTrajectories) {
    console.log('⚠️  No new trajectories collected.');
    console.log('   Check agent configuration and logs.\n');
  } else {
    console.log('⚠️  RECORD_AGENT_TRAJECTORIES is not enabled.');
    console.log('   Set RECORD_AGENT_TRAJECTORIES=true to collect trajectories.\n');
  }
}

async function main() {
  const count = parseInt(process.argv[2] || '10', 10);
  
  if (isNaN(count) || count < 1) {
    console.error('Usage: bun run scripts/collect-trajectories.ts [count]');
    console.error('Example: bun run scripts/collect-trajectories.ts 10');
    process.exit(1);
  }
  
  try {
    await collectTrajectories(count);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

