/**
 * Score Trajectories with RULER (LLM-as-judge)
 * 
 * Runs proper RULER scoring on unscored trajectories using LLM judge.
 * Groups trajectories by scenarioId for relative comparison.
 * 
 * This uses the proper RULER implementation - not simple heuristics!
 */

import { prisma } from '@/lib/prisma';
import { rulerScoringService } from '@/lib/training/RulerScoringService';

async function main() {
  console.log('━━━ RULER SCORING (LLM-as-judge) ━━━\n');
  
  // Get unscored trajectories count
  const unscoredCount = await prisma.trajectory.count({
    where: { 
      aiJudgeReward: null,
      isTrainingData: true,
      stepsJson: { not: null },
      NOT: {
        OR: [
          { stepsJson: 'null' },
          { stepsJson: '[]' }
        ]
      }
    }
  });
  
  console.log(`Found ${unscoredCount} unscored trajectories\n`);
  
  if (unscoredCount === 0) {
    console.log('✅ All trajectories already scored!');
    await prisma.$disconnect();
    return;
  }
  
  console.log('Scoring trajectories in groups by scenarioId...');
  console.log('(RULER compares trajectories relative to each other)\n');
  
  const startTime = Date.now();
  
  // Use batch scoring - groups trajectories by scenarioId automatically
  const scored = await rulerScoringService.scoreTrajectories();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n━━━ SCORING COMPLETE ━━━`);
  console.log(`✅ Scored: ${scored} trajectories`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`📊 Success Rate: ${((scored / unscoredCount) * 100).toFixed(1)}%\n`);
  
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
  console.log(`${readyForTraining >= 100 ? '✅ READY FOR TRAINING!' : '⏳ NOT READY'} (need 100+ for training)\n`);
  
  await prisma.$disconnect();
}

main();

