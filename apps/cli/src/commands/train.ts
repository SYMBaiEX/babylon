#!/usr/bin/env bun

/**
 * Training Commands
 *
 * Commands:
 *   archetype   - Train a specific agent archetype
 *   collect     - Collect trajectories for training
 *   score       - Score collected trajectories
 *   pipeline    - Run full RL training pipeline
 */

import {
  db,
  eq,
  and,
  isNull,
  not,
  count,
  trajectories,
  closeDatabase,
} from '@babylon/db';
import {
  archetypeScoringService,
  getAvailableArchetypes,
  hasCustomRubric,
  getRubric,
  trajectoryMetricsExtractor,
} from '@babylon/training';
import { agentRuntimeManager, autonomousCoordinator } from '@babylon/agents';
import { parseArgs, wantsHelp, getOption, getFlag } from '../lib/args.js';
import { logger } from '../lib/logger.js';

function printHelp(): void {
  const archetypes = getAvailableArchetypes();

  console.log(`
Training Commands

USAGE:
  babylon train <command> [options]

COMMANDS:
  archetype   Train a specific agent archetype
  collect     Collect trajectories for training
  score       Score collected trajectories

OPTIONS (archetype):
  -a, --archetype=NAME     Archetype to train (required)
  -m, --min-trajectories=N Minimum trajectories required (default: 20)
  -d, --dry-run            Show what would be done
  -s, --score-only         Only score, don't export
  -v, --verbose            Verbose output

OPTIONS (collect):
  -c, --count=N            Number of trajectories to collect (default: 10)

AVAILABLE ARCHETYPES:
${archetypes.map((a) => `  - ${a}`).join('\n')}

EXAMPLES:
  babylon train archetype -a scammer
  babylon train archetype -a trader --min-trajectories=50
  babylon train archetype -a degen --dry-run --verbose
  babylon train collect --count=100
  babylon train score
`);
}

interface ArchetypeStats {
  totalTrajectories: number;
  unscoredTrajectories: number;
  scoredTrajectories: number;
}

async function getArchetypeStats(): Promise<ArchetypeStats> {
  // Count total training trajectories
  const totalResult = await db
    .select({ count: count() })
    .from(trajectories)
    .where(
      and(
        eq(trajectories.isTrainingData, true),
        not(eq(trajectories.stepsJson, 'null')),
        not(eq(trajectories.stepsJson, '[]'))
      )
    );

  const totalTrajectories = totalResult[0]?.count || 0;

  // Count unscored
  const unscoredResult = await db
    .select({ count: count() })
    .from(trajectories)
    .where(
      and(
        eq(trajectories.isTrainingData, true),
        isNull(trajectories.aiJudgeReward),
        not(eq(trajectories.stepsJson, 'null')),
        not(eq(trajectories.stepsJson, '[]'))
      )
    );

  const unscoredTrajectories = unscoredResult[0]?.count || 0;

  return {
    totalTrajectories,
    unscoredTrajectories,
    scoredTrajectories: totalTrajectories - unscoredTrajectories,
  };
}

async function scoreArchetypeTrajectories(
  archetype: string,
  dryRun: boolean
): Promise<{ scored: number; errors: number }> {
  if (dryRun) {
    console.log(`[DRY RUN] Would score unscored ${archetype} trajectories`);
    return { scored: 0, errors: 0 };
  }

  logger.step(`Scoring trajectories with ${archetype} rubric...`);

  const result = await archetypeScoringService.scoreUnscoredTrajectories(archetype, 100);

  console.log(`  ✅ Scored: ${result.scored}`);
  if (result.errors > 0) {
    console.log(`  ⚠️  Errors: ${result.errors}`);
  }

  return result;
}

async function exportForTraining(
  archetype: string,
  minTrajectories: number,
  dryRun: boolean
): Promise<{ exported: number; path: string | null }> {
  // Get scored trajectories with valid data
  const scoredResult = await db
    .select({
      trajectoryId: trajectories.trajectoryId,
      agentId: trajectories.agentId,
      stepsJson: trajectories.stepsJson,
      aiJudgeReward: trajectories.aiJudgeReward,
      aiJudgeReasoning: trajectories.aiJudgeReasoning,
      scenarioId: trajectories.scenarioId,
      finalPnL: trajectories.finalPnL,
    })
    .from(trajectories)
    .where(
      and(
        eq(trajectories.isTrainingData, true),
        not(isNull(trajectories.aiJudgeReward)),
        not(eq(trajectories.stepsJson, 'null')),
        not(eq(trajectories.stepsJson, '[]'))
      )
    );

  if (scoredResult.length < minTrajectories) {
    logger.warn(`Not enough scored trajectories: ${scoredResult.length} < ${minTrajectories}`);
    return { exported: 0, path: null };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would export ${scoredResult.length} trajectories for ${archetype} training`);
    return { exported: scoredResult.length, path: null };
  }

  logger.step(`Exporting ${scoredResult.length} trajectories for training...`);

  // Create export directory
  const exportDir = `./training-data/${archetype}`;
  const { mkdir, writeFile } = await import('fs/promises');
  await mkdir(exportDir, { recursive: true });

  // Export as JSONL for GRPO training
  const exportPath = `${exportDir}/trajectories-${Date.now()}.jsonl`;
  const lines: string[] = [];

  for (const traj of scoredResult) {
    const metrics = trajectoryMetricsExtractor.extractFromRaw({
      trajectoryId: traj.trajectoryId,
      agentId: traj.agentId,
      stepsJson: traj.stepsJson,
      scenarioId: traj.scenarioId ?? undefined,
      finalPnL: traj.finalPnL ?? undefined,
    });

    const exportRecord = {
      trajectory_id: traj.trajectoryId,
      agent_id: traj.agentId,
      archetype,
      score: traj.aiJudgeReward,
      reasoning: traj.aiJudgeReasoning,
      scenario_id: traj.scenarioId,
      final_pnl: traj.finalPnL,
      steps: JSON.parse(traj.stepsJson),
      metrics: metrics || {},
    };

    lines.push(JSON.stringify(exportRecord));
  }

  await writeFile(exportPath, lines.join('\n'));

  logger.success(`Exported to: ${exportPath}`);

  return { exported: scoredResult.length, path: exportPath };
}

async function trainArchetype(args: ReturnType<typeof parseArgs>): Promise<void> {
  const archetype = (getOption(args, 'archetype', 'a') || '').toLowerCase();
  const minTrajectories = parseInt(getOption(args, 'min-trajectories', 'm') || '20', 10);
  const dryRun = getFlag(args, 'dry-run', 'd');
  const scoreOnly = getFlag(args, 'score-only', 's');
  const verbose = getFlag(args, 'verbose', 'v');

  if (!archetype) {
    logger.fail('--archetype is required');
    console.log('\nAvailable archetypes:');
    for (const a of getAvailableArchetypes()) {
      console.log(`  - ${a}`);
    }
    process.exit(1);
  }

  if (!hasCustomRubric(archetype)) {
    logger.warn(`No custom rubric for "${archetype}", using default rubric`);
  }

  logger.header(`Training: ${archetype.toUpperCase()}`);

  // Get stats
  logger.step('Gathering statistics...');
  const stats = await getArchetypeStats();

  console.log(`
   Total trajectories:    ${stats.totalTrajectories}
   Already scored:        ${stats.scoredTrajectories}
   Need scoring:          ${stats.unscoredTrajectories}
`);

  if (stats.totalTrajectories === 0) {
    logger.fail(`No trajectories found`);
    console.log(`
To generate trajectories:
  1. Create agents with this archetype
  2. Run them through simulations
  3. Re-run this command

Example:
  babylon agent spawn --archetype ${archetype} --count 5
  babylon train collect --count 100
  babylon train archetype -a ${archetype}
`);
    process.exit(1);
  }

  // Show rubric preview
  if (verbose) {
    console.log('📜 Rubric preview (first 500 chars):');
    const rubric = getRubric(archetype);
    console.log(`   ${rubric.substring(0, 500).replace(/\n/g, '\n   ')}...`);
    console.log('');
  }

  // Score unscored trajectories
  if (stats.unscoredTrajectories > 0) {
    const scoreResult = await scoreArchetypeTrajectories(archetype, dryRun);
    stats.scoredTrajectories += scoreResult.scored;
  } else {
    logger.success('All trajectories already scored');
  }

  // Export for training (unless score-only)
  if (!scoreOnly) {
    const exportResult = await exportForTraining(archetype, minTrajectories, dryRun);

    if (exportResult.path) {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      TRAINING READY                           ║
╚═══════════════════════════════════════════════════════════════╝

Data exported to: ${exportResult.path}

Next steps:
  1. Run GRPO training:
     python packages/training/python/scripts/train_grpo.py \\
       --data ${exportResult.path} \\
       --archetype ${archetype}

  2. Or run the full pipeline:
     bun run scripts/run-full-rl-pipeline.ts --archetype ${archetype}
`);
    }
  } else {
    logger.success(`Scoring complete. Total scored: ${stats.scoredTrajectories}`);
    console.log(`
To export for training, run without --score-only:
  babylon train archetype -a ${archetype}
`);
  }
}

async function collectTrajectories(args: ReturnType<typeof parseArgs>): Promise<void> {
  const countArg = parseInt(getOption(args, 'count', 'c') || '10', 10);

  logger.header('Trajectory Collection');

  // Check environment variable
  if (process.env.RECORD_AGENT_TRAJECTORIES !== 'true') {
    logger.warn('RECORD_AGENT_TRAJECTORIES is not set to "true"');
    console.log('   Trajectories will NOT be recorded!\n');
    console.log('   Set it with: export RECORD_AGENT_TRAJECTORIES=true\n');
  } else {
    logger.success('RECORD_AGENT_TRAJECTORIES=true');
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
        { autonomousGroupChats: true },
      ],
    },
    take: 10,
  });

  if (agents.length === 0) {
    logger.fail('No agents found!');
    console.log(`
   Agents need:
   - isAgent: true
   - agentPointsBalance >= 1
   - At least one autonomous feature enabled

   Create agents with: babylon agent spawn
`);
    process.exit(1);
  }

  console.log(`Found ${agents.length} agents`);
  console.log(`Collecting ${countArg} trajectories...\n`);

  const recordTrajectories = process.env.RECORD_AGENT_TRAJECTORIES === 'true';
  let errors = 0;

  // Get initial count
  const initialCount = await db.trajectory.count();
  console.log(`Current trajectories in database: ${initialCount}\n`);

  for (let i = 0; i < countArg; i++) {
    const agent = agents[i % agents.length]!;

    console.log(`[${i + 1}/${countArg}] Running agent: ${agent.username || agent.id}`);

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
        }
      } else {
        console.log('  ⚠️  Completed but not successful');
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      errors++;
    }

    // Small delay between runs
    if (i < countArg - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Get final count
  const finalCount = await db.trajectory.count();
  const newTrajectories = finalCount - initialCount;

  logger.header('Summary');
  console.log(`Trajectories collected: ${newTrajectories}`);
  console.log(`Successful runs: ${countArg - errors}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total trajectories in database: ${finalCount}`);

  if (newTrajectories > 0) {
    logger.success('Trajectories successfully collected!');
    console.log('   Ready for training when you have enough data.\n');
  } else if (recordTrajectories) {
    logger.warn('No new trajectories collected.');
    console.log('   Check agent configuration and logs.\n');
  } else {
    logger.warn('RECORD_AGENT_TRAJECTORIES is not enabled.');
    console.log('   Set RECORD_AGENT_TRAJECTORIES=true to collect trajectories.\n');
  }
}

async function scoreTrajectories(): Promise<void> {
  logger.header('Score Trajectories');

  const stats = await getArchetypeStats();

  console.log(`Total trajectories: ${stats.totalTrajectories}`);
  console.log(`Already scored: ${stats.scoredTrajectories}`);
  console.log(`Need scoring: ${stats.unscoredTrajectories}`);

  if (stats.unscoredTrajectories === 0) {
    logger.success('All trajectories already scored');
    return;
  }

  const result = await archetypeScoringService.scoreUnscoredTrajectories('default', 100);

  logger.success(`Scored ${result.scored} trajectories`);
  if (result.errors > 0) {
    logger.warn(`${result.errors} errors encountered`);
  }
}

export async function runTrainCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case 'archetype':
        await trainArchetype(parsed);
        break;

      case 'collect':
        await collectTrajectories(parsed);
        break;

      case 'score':
        await scoreTrajectories();
        break;

      default:
        if (parsed.command) {
          logger.fail(`Unknown command: ${parsed.command}`);
        }
        printHelp();
        process.exit(parsed.command ? 1 : 0);
    }
  } finally {
    await closeDatabase();
  }
}

