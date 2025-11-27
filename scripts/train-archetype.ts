#!/usr/bin/env bun
/**
 * Train Archetype Script
 *
 * End-to-end training for a specific agent archetype:
 * 1. Find or generate trajectories for the archetype
 * 2. Extract behavioral metrics
 * 3. Score with LLM judge using archetype-specific rubric
 * 4. Export data for GRPO training
 *
 * Usage:
 *   bun run scripts/train-archetype.ts --archetype scammer
 *   bun run scripts/train-archetype.ts --archetype trader --min-trajectories 50
 *   bun run scripts/train-archetype.ts --archetype social-butterfly --dry-run
 */

import { parseArgs } from 'util';
import {
  db,
  eq,
  and,
  isNull,
  not,
  count,
  trajectories,
} from '@babylon/db';
import {
  archetypeScoringService,
  getAvailableArchetypes,
  hasCustomRubric,
  getRubric,
  trajectoryMetricsExtractor,
} from '@babylon/training';

interface Args {
  archetype: string;
  minTrajectories: number;
  dryRun: boolean;
  scoreOnly: boolean;
  verbose: boolean;
  help: boolean;
}

function parseArguments(): Args {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      archetype: {
        type: 'string',
        short: 'a',
      },
      'min-trajectories': {
        type: 'string',
        short: 'm',
        default: '20',
      },
      'dry-run': {
        type: 'boolean',
        short: 'd',
        default: false,
      },
      'score-only': {
        type: 'boolean',
        short: 's',
        default: false,
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    strict: false,
  });

  return {
    archetype: values.archetype as string || '',
    minTrajectories: parseInt(values['min-trajectories'] as string, 10) || 20,
    dryRun: values['dry-run'] as boolean || false,
    scoreOnly: values['score-only'] as boolean || false,
    verbose: values.verbose as boolean || false,
    help: values.help as boolean || false,
  };
}

function printHelp(): void {
  console.log(`
Train Archetype - Multi-criteria GRPO training for agent archetypes

USAGE:
  bun run scripts/train-archetype.ts --archetype <name> [options]

OPTIONS:
  -a, --archetype <name>     Archetype to train (required)
  -m, --min-trajectories <n> Minimum trajectories required (default: 20)
  -d, --dry-run              Show what would be done without executing
  -s, --score-only           Only score trajectories, don't export for training
  -v, --verbose              Verbose output
  -h, --help                 Show this help message

AVAILABLE ARCHETYPES:
${getAvailableArchetypes().map((a) => `  - ${a}`).join('\n')}

EXAMPLES:
  # Train the scammer archetype
  bun run scripts/train-archetype.ts --archetype scammer

  # Score trader trajectories without exporting
  bun run scripts/train-archetype.ts --archetype trader --score-only

  # Dry run with verbose output
  bun run scripts/train-archetype.ts --archetype degen --dry-run --verbose
`);
}

async function getArchetypeStats(_archetype: string): Promise<{
  totalTrajectories: number;
  unscoredTrajectories: number;
  scoredTrajectories: number;
}> {
  // Note: archetype is not stored in DB, so we count all training trajectories
  // In production, you'd filter by agent IDs that are known to have this archetype

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
  dryRun: boolean,
  _verbose: boolean
): Promise<{ scored: number; errors: number }> {
  if (dryRun) {
    console.log(`[DRY RUN] Would score unscored ${archetype} trajectories`);
    return { scored: 0, errors: 0 };
  }

  console.log(`\n🎯 Scoring trajectories with ${archetype} rubric...`);

  const result = await archetypeScoringService.scoreUnscoredTrajectories(archetype, 100);

  console.log(`   ✅ Scored: ${result.scored}`);
  if (result.errors > 0) {
    console.log(`   ⚠️  Errors: ${result.errors}`);
  }

  return result;
}

async function exportForTraining(
  archetype: string,
  minTrajectories: number,
  dryRun: boolean,
  verbose: boolean
): Promise<{ exported: number; path: string | null }> {
  // Get scored trajectories
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
    .innerJoin(users, eq(trajectories.agentId, users.id))
    .where(
      and(
        eq(users.archetype, archetype),
        eq(trajectories.isTrainingData, true),
        not(isNull(trajectories.aiJudgeReward)),
        not(eq(trajectories.stepsJson, 'null')),
        not(eq(trajectories.stepsJson, '[]'))
      )
    );

  if (scoredResult.length < minTrajectories) {
    console.log(
      `\n⚠️  Not enough scored trajectories for training: ${scoredResult.length} < ${minTrajectories}`
    );
    return { exported: 0, path: null };
  }

  if (dryRun) {
    console.log(
      `[DRY RUN] Would export ${scoredResult.length} trajectories for ${archetype} training`
    );
    return { exported: scoredResult.length, path: null };
  }

  console.log(`\n📦 Exporting ${scoredResult.length} trajectories for training...`);

  // Create export directory
  const exportDir = `./training-data/${archetype}`;
  const { mkdir, writeFile } = await import('fs/promises');
  await mkdir(exportDir, { recursive: true });

  // Export as JSONL for GRPO training
  const exportPath = `${exportDir}/trajectories-${Date.now()}.jsonl`;
  const lines: string[] = [];

  for (const traj of scoredResult) {
    // Extract metrics for the export
    const metrics = trajectoryMetricsExtractor.extractFromRaw({
      trajectoryId: traj.trajectoryId,
      agentId: traj.agentId,
      stepsJson: traj.stepsJson,
      scenarioId: traj.scenarioId || undefined,
      finalPnL: traj.finalPnL || undefined,
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

  console.log(`   ✅ Exported to: ${exportPath}`);

  return { exported: scoredResult.length, path: exportPath };
}

async function main(): Promise<void> {
  const args = parseArguments();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.archetype) {
    console.error('❌ Error: --archetype is required');
    console.log('\nAvailable archetypes:');
    for (const a of getAvailableArchetypes()) {
      console.log(`  - ${a}`);
    }
    process.exit(1);
  }

  const archetype = args.archetype.toLowerCase();

  // Validate archetype
  if (!hasCustomRubric(archetype)) {
    console.log(`⚠️  Warning: No custom rubric for "${archetype}", using default rubric`);
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          ARCHETYPE TRAINING: ${archetype.toUpperCase().padEnd(30)}║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Get stats
  console.log('📊 Gathering statistics...');
  const stats = await getArchetypeStats(archetype);

  console.log(`
   Total trajectories:    ${stats.totalTrajectories}
   Already scored:        ${stats.scoredTrajectories}
   Need scoring:          ${stats.unscoredTrajectories}
`);

  if (stats.totalTrajectories === 0) {
    console.log(`
❌ No trajectories found for archetype "${archetype}".

To generate trajectories:
  1. Create agents with this archetype
  2. Run them through simulations
  3. Re-run this script

Example:
  bun run scripts/spawn-archetype-agents.ts --archetype ${archetype} --count 5
  bun run scripts/run-simulation.ts --ticks 500
  bun run scripts/train-archetype.ts --archetype ${archetype}
`);
    process.exit(1);
  }

  // Show rubric preview
  if (args.verbose) {
    console.log('📜 Rubric preview (first 500 chars):');
    const rubric = getRubric(archetype);
    console.log(`   ${rubric.substring(0, 500).replace(/\n/g, '\n   ')}...`);
    console.log('');
  }

  // Score unscored trajectories
  if (stats.unscoredTrajectories > 0) {
    const scoreResult = await scoreArchetypeTrajectories(archetype, args.dryRun, args.verbose);
    stats.scoredTrajectories += scoreResult.scored;
  } else {
    console.log('✅ All trajectories already scored');
  }

  // Export for training (unless score-only)
  if (!args.scoreOnly) {
    const exportResult = await exportForTraining(
      archetype,
      args.minTrajectories,
      args.dryRun,
      args.verbose
    );

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
    console.log(`
✅ Scoring complete. Total scored: ${stats.scoredTrajectories}

To export for training, run without --score-only:
  bun run scripts/train-archetype.ts --archetype ${archetype}
`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

