#!/usr/bin/env bun

/**
 * Game Commands
 *
 * Commands:
 *   generate   - Generate a new game with scenarios and questions
 *   simulate   - Run game simulation
 *   world      - Generate world data
 */

import { db } from '@babylon/db';
import { GameGenerator, GameSimulator, loadActorsData } from '@babylon/engine';
import { nanoid } from 'nanoid';
import { writeFile } from 'fs/promises';
import { parseArgs, wantsHelp, getOption, getFlag } from '../lib/args.js';
import { logger } from '../lib/logger.js';
import type { GameHistory, GroupMessage } from '@babylon/engine';
import type { JsonValue } from '@babylon/db';

function printHelp(): void {
  console.log(`
Game Commands

USAGE:
  babylon game <command> [options]

COMMANDS:
  generate    Generate a new game with scenarios and questions
  simulate    Run game simulation
  world       Generate world data

OPTIONS (generate):
  -v, --verbose    Enable detailed logging

OPTIONS (simulate):
  --outcome=YES|NO  Predetermined outcome (default: YES)
  --count=N         Number of simulations (default: 1)
  --fast            Skip detailed logging
  --save=FILE       Save game data to file
  --json            Output JSON only

EXAMPLES:
  babylon game generate
  babylon game generate --verbose
  babylon game simulate
  babylon game simulate --outcome=NO --count=100 --fast
  babylon game simulate --save=output.json
`);
}

async function generateSnowflakeId(): Promise<string> {
  return nanoid(21);
}

function validateGameHistory(value: JsonValue): GameHistory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid game history format');
  }

  const obj = value as Record<string, JsonValue>;

  if (
    typeof obj.gameNumber !== 'number' ||
    typeof obj.completedAt !== 'string' ||
    typeof obj.summary !== 'string' ||
    !Array.isArray(obj.keyOutcomes) ||
    !Array.isArray(obj.highlights) ||
    !Array.isArray(obj.topMoments)
  ) {
    throw new Error('Invalid game history format');
  }

  return {
    gameNumber: obj.gameNumber as number,
    completedAt: obj.completedAt as string,
    summary: obj.summary as string,
    keyOutcomes: obj.keyOutcomes as GameHistory['keyOutcomes'],
    highlights: obj.highlights as string[],
    topMoments: obj.topMoments as string[],
  };
}

async function generateMinimalGameHistory(
  gameId: string,
  gameNumber: number
): Promise<GameHistory> {
  const posts = await db.post.findMany({
    where: { gameId, deletedAt: null },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });

  const topPosts = posts.slice(0, 10);
  const summary = `Game ${gameNumber} featured ${posts.length} posts over 30 days.`;

  const highlights = topPosts.map((p) =>
    p.content.length > 100 ? p.content.substring(0, 100) + '...' : p.content
  );

  return {
    gameNumber,
    completedAt: new Date().toISOString(),
    summary,
    keyOutcomes: [],
    highlights,
    topMoments: highlights.slice(0, 5),
  };
}

async function validateActorsData(): Promise<void> {
  const actorsData = loadActorsData();
  const actors = actorsData.actors;
  const organizations = actorsData.organizations;

  const validOrgIds = new Set(organizations.map((org) => org.id));
  const errors: string[] = [];

  for (const actor of actors) {
    if (!actor.affiliations || actor.affiliations.length === 0) continue;

    for (const affiliation of actor.affiliations) {
      if (!validOrgIds.has(affiliation)) {
        errors.push(`${actor.name} (${actor.id}) has invalid affiliation: "${affiliation}"`);
      }
    }
  }

  if (errors.length > 0) {
    logger.fail('Actor validation failed');
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
    process.exit(1);
  }
}

async function generateGame(args: ReturnType<typeof parseArgs>): Promise<void> {
  const verbose = getFlag(args, 'verbose', 'v');

  logger.header('Babylon Game Generator');

  // Validate actors
  logger.step('Validating actors...');
  await validateActorsData();
  logger.success('Actors validated');

  // Check API keys
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    logger.fail('No API key found!');
    console.log('\nSet one of the following:');
    console.log('  export GROQ_API_KEY=your_key_here');
    console.log('  export OPENAI_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log(`Using: ${groqKey ? 'Groq' : 'OpenAI'}`);

  const startTime = Date.now();

  // Check for existing games
  const existingGames = await db.game.findMany({
    orderBy: { currentDate: 'desc' },
  });

  if (existingGames.length === 0) {
    logger.step('No genesis game found, generating...');
    const generator = new GameGenerator();
    const genesis = await generator.generateGenesis();

    await db.game.create({
      data: {
        id: await generateSnowflakeId(),
        isContinuous: false,
        isRunning: false,
        currentDate: new Date(),
        speed: 60000,
        updatedAt: new Date(),
      },
    });

    logger.success('Genesis game created');
    console.log(`  Events: ${genesis.timeline.reduce((sum, day) => sum + day.events.length, 0)}`);
    console.log(`  Posts: ${genesis.timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`);
  } else {
    console.log(`Found ${existingGames.length} existing game(s)`);
  }

  // Load history
  const history: GameHistory[] = [];
  let nextStartDate: string;
  let gameNumber = 1;

  if (existingGames.length > 0) {
    for (let i = Math.max(0, existingGames.length - 2); i < existingGames.length; i++) {
      const gameData = existingGames[i];
      if (!gameData) continue;

      const historyConfig = await db.gameConfig.findUnique({
        where: { key: `game-history-${gameData.id}` },
      });

      if (historyConfig?.value) {
        history.push(validateGameHistory(historyConfig.value));
      } else {
        history.push(await generateMinimalGameHistory(gameData.id, i + 1));
      }
    }

    const lastGame = existingGames[0]!;
    const nextDate = new Date(lastGame.currentDate);
    nextDate.setDate(nextDate.getDate() + 30);
    nextStartDate = nextDate.toISOString().split('T')[0]!;
    gameNumber = existingGames.length + 1;
  } else {
    const now = new Date();
    nextStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  logger.step(`Generating Game #${gameNumber} (starting ${nextStartDate})...`);

  const generator = new GameGenerator(undefined, history.length > 0 ? history : undefined);
  const game = await generator.generateCompleteGame(nextStartDate);
  const duration = Date.now() - startTime;

  logger.success('Generation complete');
  console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Events: ${game.timeline.reduce((sum, day) => sum + day.events.length, 0)}`);
  console.log(`  Posts: ${game.timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`);
  console.log(`  Group messages: ${Object.values(game.timeline.reduce((acc, day) => {
    Object.entries(day.groupChats).forEach(([groupId, messages]) => {
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId]!.push(...messages);
    });
    return acc;
  }, {} as Record<string, GroupMessage[]>)).flat().length}`);

  // Show scenarios
  console.log('\nScenarios:');
  game.setup.scenarios.forEach((scenario) => {
    console.log(`  ${scenario.id}. ${scenario.title} (${scenario.theme})`);
    if (verbose) {
      console.log(`     ${scenario.description}`);
    }
  });

  // Save to database
  logger.step('Saving to database...');

  const gameHistory = generator.createGameHistory(game);

  const savedGame = await db.game.create({
    data: {
      id: await generateSnowflakeId(),
      isContinuous: false,
      isRunning: false,
      currentDate: new Date(nextStartDate),
      speed: 60000,
      updatedAt: new Date(),
    },
  });

  await db.gameConfig.upsert({
    where: { key: `game-history-${savedGame.id}` },
    update: { value: gameHistory as never, updatedAt: new Date() },
    create: {
      id: await generateSnowflakeId(),
      key: `game-history-${savedGame.id}`,
      value: gameHistory as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.success(`Game saved (ID: ${savedGame.id})`);
}

async function runSimulation(args: ReturnType<typeof parseArgs>): Promise<void> {
  const outcomeStr = getOption(args, 'outcome');
  const countStr = getOption(args, 'count');
  const save = getOption(args, 'save');
  const fast = getFlag(args, 'fast');
  const verbose = getFlag(args, 'verbose', 'v');
  const jsonOutput = getFlag(args, 'json');

  const outcome = outcomeStr !== 'NO';
  const count = parseInt(countStr || '1', 10);

  if (count === 1) {
    // Single game
    const simulator = new GameSimulator({
      outcome,
      numAgents: 5,
      duration: 30,
    });

    if (verbose && !jsonOutput) {
      logger.header('Game Simulation');

      simulator.on('game:started', (event) => {
        console.log(`Question: ${event.data.question}`);
        console.log(`Outcome: ${outcome ? 'YES' : 'NO'}`);
        console.log(`Agents: ${event.data.agents}`);
      });

      simulator.on('agent:bet', (event) => {
        console.log(`${event.agentId}: Bet ${event.data.outcome ? 'YES' : 'NO'} (${event.data.amount} tokens)`);
      });

      simulator.on('outcome:revealed', (event) => {
        console.log(`\nOutcome: ${event.data.outcome ? 'YES' : 'NO'}`);
      });

      simulator.on('game:ended', (event) => {
        console.log(`Winners: ${event.data.winners.join(', ')}`);
      });
    }

    const result = await simulator.runCompleteGame();

    if (save) {
      await writeFile(save, JSON.stringify(result, null, 2));
      if (!jsonOutput) {
        logger.success(`Saved to: ${save}`);
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\nGame complete:');
      console.log(`  Duration: ${result.endTime - result.startTime}ms`);
      console.log(`  Events: ${result.events.length}`);
      console.log(`  Winners: ${result.winners.length}/${result.agents.length}`);
    }
  } else {
    // Batch games
    if (!jsonOutput) {
      logger.header(`Running ${count} simulations...`);
    }

    const results = [];
    const start = Date.now();

    for (let i = 0; i < count; i++) {
      const sim = new GameSimulator({
        outcome: i % 2 === 0,
        numAgents: 5,
      });
      const result = await sim.runCompleteGame();
      results.push(result);

      if (!fast && !jsonOutput) {
        process.stdout.write(`\r[${i + 1}/${count}] ${Math.round(((i + 1) / count) * 100)}%`);
      }
    }

    const duration = Date.now() - start;

    if (jsonOutput) {
      console.log(JSON.stringify({
        count: results.length,
        duration,
        results: results.map((r) => ({
          id: r.id,
          outcome: r.outcome,
          winners: r.winners.length,
          events: r.events.length,
        })),
      }, null, 2));
    } else {
      const yesGames = results.filter((r) => r.outcome).length;
      console.log(`\n\n${count} games completed`);
      console.log(`  Total time: ${duration}ms`);
      console.log(`  Avg time: ${Math.round(duration / count)}ms/game`);
      console.log(`  YES outcomes: ${yesGames} (${Math.round((yesGames / count) * 100)}%)`);
      console.log(`  NO outcomes: ${count - yesGames} (${Math.round(((count - yesGames) / count) * 100)}%)`);
    }
  }
}

export async function runGameCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case 'generate':
        await generateGame(parsed);
        break;

      case 'simulate':
        await runSimulation(parsed);
        break;

      case 'world':
        logger.header('World Generation');
        console.log('World generation is run via:');
        console.log('  babylon game generate');
        console.log('\nOr directly:');
        console.log('  bun run apps/cli/src/generate-world.ts');
        break;

      default:
        if (parsed.command) {
          logger.fail(`Unknown command: ${parsed.command}`);
        }
        printHelp();
        process.exit(parsed.command ? 1 : 0);
    }
  } finally {
    await db.$disconnect();
  }
}

