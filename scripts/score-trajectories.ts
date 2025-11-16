/**
 * Score Trajectories with RULER
 * 
 * Runs RULER scoring on unscored trajectories to make them ready for training
 */

import { prisma } from '@/lib/prisma';
import { rulerScoringService } from '@/lib/training/RulerScoringService';

async function main() {
  console.log('━━━ RULER SCORING ━━━\n');
  
  // Get unscored trajectories
  const unscored = await prisma.trajectory.findMany({
    where: { aiJudgeReward: null },
    select: { trajectoryId: true, windowId: true },
    take: 100
  });
  
  console.log(`Found ${unscored.length} unscored trajectories\n`);
  
  if (unscored.length === 0) {
    console.log('✅ All trajectories already scored!');
    await prisma.$disconnect();
    return;
  }
  
  let scored = 0;
  let failed = 0;
  
  console.log(`Scoring ${unscored.length} trajectories...\n`);
  
  for (const traj of unscored) {
    try {
      const score = await rulerScoringService.scoreTrajectory(traj.trajectoryId);
      if (score && score.overallScore !== null) {
        console.log(`✅ ${traj.trajectoryId.substring(0, 12)}... scored: ${score.overallScore.toFixed(3)}`);
        scored++;
      } else {
        console.log(`⚠️  ${traj.trajectoryId.substring(0, 12)}... no score returned`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${traj.trajectoryId.substring(0, 12)}... error: ${error instanceof Error ? error.message : 'Failed'}`);
      failed++;
    }
  }
  
  console.log(`\n━━━ SCORING COMPLETE ━━━`);
  console.log(`✅ Scored: ${scored}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success Rate: ${((scored / unscored.length) * 100).toFixed(1)}%\n`);
  
  // Check readiness for training
  const readyForTraining = await prisma.trajectory.count({
    where: {
      isTrainingData: true,
      usedInTraining: false,
      aiJudgeReward: { not: null },
      NOT: {
        OR: [
          { stepsJson: 'null' },
          { stepsJson: '[]' }
        ]
      }
    }
  });
  
  console.log(`✅ ${readyForTraining} trajectories ready for training`);
  console.log(`${readyForTraining >= 100 ? '✅ READY' : '⏳ NOT READY'} (need 100+ for training)\n`);
  
  await prisma.$disconnect();
}

main();

