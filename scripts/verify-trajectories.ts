/**
 * Verify Trajectories Created
 */

import { db } from '@/db';

async function main() {
  console.log('━━━ TRAJECTORY VERIFICATION ━━━\n');
  
  const count = await db.trajectory.count();
  console.log('Total trajectories:', count);
  
  const scored = await db.trajectory.count({
    where: { aiJudgeReward: { not: null } }
  });
  
  const unscored = await db.trajectory.count({
    where: { aiJudgeReward: null }
  });
  
  console.log('Scored:', scored);
  console.log('Unscored:', unscored);
  
  const recent = await db.trajectory.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      trajectoryId: true,
      episodeLength: true,
      totalReward: true,
      aiJudgeReward: true,
      isTrainingData: true,
      windowId: true
    }
  });
  
  console.log('\nRecent trajectories:');
  recent.forEach(t => {
    console.log(`  ${t.trajectoryId.substring(0, 12)}... - ${t.episodeLength} steps, reward: ${t.totalReward.toFixed(2)}, scored: ${t.aiJudgeReward !== null ? '✅' : '❌'}`);
  });
  
  console.log(`\n✅ ${count} trajectories in database`);
  console.log(`✅ ${scored} already scored`);
  console.log(`⚠️  ${unscored} need RULER scoring`);
  
  await db.$disconnect();
}

main();
