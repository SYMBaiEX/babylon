#!/usr/bin/env bun
/**
 * Check scored trajectories
 */

import { count, db, desc, isNotNull, trajectories } from '@babylon/db';

async function main() {
  console.log('Checking scored trajectories...\n');

  // Count total and scored
  const totalResult = await db.select({ count: count() }).from(trajectories);
  const scoredResult = await db
    .select({ count: count() })
    .from(trajectories)
    .where(isNotNull(trajectories.aiJudgeReward));

  console.log(`Total trajectories: ${totalResult[0]?.count || 0}`);
  console.log(`Scored trajectories: ${scoredResult[0]?.count || 0}`);

  // Get some scored trajectories
  const scored = await db
    .select({
      id: trajectories.id,
      agentId: trajectories.agentId,
      totalReward: trajectories.totalReward,
      aiJudgeReward: trajectories.aiJudgeReward,
      aiJudgeReasoning: trajectories.aiJudgeReasoning,
      judgedAt: trajectories.judgedAt,
    })
    .from(trajectories)
    .where(isNotNull(trajectories.aiJudgeReward))
    .orderBy(desc(trajectories.judgedAt))
    .limit(5);

  if (scored.length > 0) {
    console.log(`\nSample scored trajectories:`);
    console.log('─'.repeat(100));
    for (const traj of scored) {
      const archetype = traj.agentId.replace('agent-', '').split('-')[0];
      console.log(
        `  ${archetype.padEnd(15)} | AI Score: ${traj.aiJudgeReward?.toFixed(3)} | Original: ${traj.totalReward?.toFixed(3)}`
      );
      if (traj.aiJudgeReasoning) {
        console.log(
          `    Reasoning: ${traj.aiJudgeReasoning.substring(0, 80)}...`
        );
      }
    }
  } else {
    console.log('\nNo trajectories have AI scoring yet.');
    console.log(
      'This requires LLM API access (GROQ_API_KEY or OPENAI_API_KEY)'
    );
  }

  process.exit(0);
}

main().catch(console.error);
