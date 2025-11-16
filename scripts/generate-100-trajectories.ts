/**
 * Generate 100+ Trajectories for RL Training
 * 
 * Creates enough trajectories to trigger training (100+ scored needed)
 */

import { trajectoryRecorder } from '@/lib/training/TrajectoryRecorder';
import { prisma } from '@/lib/prisma';
import { generateSnowflakeId } from '@/lib/snowflake';

async function main() {
  console.log('\n━━━ GENERATING 100+ TRAJECTORIES ━━━\n');
  
  // Step 1: Create 5 agents
  console.log('Step 1: Creating 5 test agents...\n');
  
  const agents = [];
  for (let i = 1; i <= 5; i++) {
    let agent = await prisma.user.findFirst({
      where: { username: `rl-test-agent-${i}` }
    });
    
    if (!agent) {
      agent = await prisma.user.create({
        data: {
          id: await generateSnowflakeId(),
          username: `rl-test-agent-${i}`,
          displayName: `RL Test Agent ${i}`,
          isAgent: true,
          isTest: true,
          agentSystem: `Trading agent ${i}`,
          virtualBalance: 10000,
          autonomousTrading: true,
          updatedAt: new Date()
        }
      });
    }
    agents.push(agent);
    console.log(`  ✅ Agent ${i}: ${agent.username}`);
  }
  
  console.log(`\n✅ ${agents.length} agents ready\n`);
  
  // Step 2: Generate 100 trajectories (20 per agent)
  console.log('Step 2: Generating 100 trajectories...\n');
  
  let created = 0;
  
  for (const agent of agents) {
    for (let j = 0; j < 20; j++) {
      const hour = 10 + Math.floor(j / 4);
      const windowId = `2025-01-15T${hour.toString().padStart(2, '0')}:00`;
      
      const trajectoryId = await trajectoryRecorder.startTrajectory({
        agentId: agent.id,
        windowId,
        scenarioId: `test-scenario-${j}`
      });
      
      // Add 8-15 steps per trajectory
      const numSteps = 8 + Math.floor(Math.random() * 7);
      for (let step = 0; step < numSteps; step++) {
        trajectoryRecorder.startStep(trajectoryId, {
          agentBalance: 10000 + Math.random() * 2000,
          agentPnL: -500 + Math.random() * 1500,
          openPositions: Math.floor(Math.random() * 5)
        });
        
        const actionType = Math.random() > 0.3 ? 'TRADE' : 'HOLD';
        
        trajectoryRecorder.completeStep(trajectoryId, {
          actionType,
          parameters: actionType === 'TRADE' ? {
            ticker: ['BTC', 'ETH', 'SOL'][Math.floor(Math.random() * 3)],
            amount: 10 + Math.floor(Math.random() * 90)
          } : {},
          success: true,
          result: actionType === 'TRADE' ? {
            executed: true,
            pnl: -50 + Math.random() * 150
          } : { held: true }
        }, Math.random());
      }
      
      await trajectoryRecorder.endTrajectory(trajectoryId, {
        finalPnL: -500 + Math.random() * 1500,
        finalBalance: 10000 + Math.random() * 2000,
        windowId
      });
      
      created++;
      if (created % 20 === 0) {
        console.log(`  Progress: ${created}/100 trajectories created`);
      }
    }
  }
  
  const total = await prisma.trajectory.count();
  console.log(`\n✅ Successfully created ${created} new trajectories`);
  console.log(`✅ Total in database: ${total}\n`);
  
  await prisma.$disconnect();
}

main();

