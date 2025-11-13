#!/usr/bin/env bun

/**
 * Babylon CLI - Smart Game Generator
 * 
 * Generates contiguous 30-day prediction market games with persistent history.
 * Automatically manages genesis and game continuity.
 * 
 * Flow:
 * 1. Check for genesis.json, generate if missing
 * 2. Look for previous games in games/ folder
 * 3. Load last 2-3 games as context
 * 4. Generate next game 30 days after the last
 * 5. Save to games/ with timestamp and update latest.json
 * 
 * Requirements:
 * - GROQ_API_KEY or OPENAI_API_KEY environment variable must be set
 * - Never falls back to mock/template generation
 * - Retries on failures with exponential backoff
 * 
 * Usage:
 *   bun run generate              (smart generation with history)
 *   bun run generate --verbose    (show detailed output)
 */

import { GameGenerator, type GameHistory, type GeneratedGame } from '../generator/GameGenerator';
import type { ChatMessage } from '@/shared/types';
import { logger } from '@/lib/logger';
import { db } from '@/lib/database-service';
import { generateSnowflakeId } from '@/lib/snowflake';

// Commented out unused schema - types defined inline where needed
// const GameFileSchema = z.object({
//   timestamp: z.date(),
//   game: z.any(),
//   history: z.any().optional(),
// });

interface GameFile {
  timestamp: Date;
  game: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  history?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface CLIOptions {
  verbose?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  args.forEach(arg => {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  });

  return options;
}

/**
 * Load previous games from database
 * Returns last N games sorted by timestamp (most recent first)
 * @deprecated This function is not currently used
 */
// @ts-expect-error - unused function kept for reference
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadPreviousGames(maxGames = 3): Promise<GameFile[]> {
  // Load games from database
  const dbGames = await db.getAllGames();
  
  if (dbGames.length === 0) {
    return [];
  }

  // Convert to GameFile format
  const gameFiles: GameFile[] = [];
  
  // Note: Game model doesn't store full game data anymore (just metadata)
  // This function would need to reconstruct game data from posts/events
  // For now, return empty array or load from files
  logger.warn('Loading games from database not fully implemented - use file-based games instead', undefined, 'CLI');
  
  // Return empty array for now
  // TODO: Reconstruct game data from database posts/events if needed

  // Return empty for now (game data loading not implemented)
  return gameFiles;
}

/**
 * Validate actors data from database before generating game
 */
async function validateActorsData(): Promise<void> {
  const actors = await db.getAllActors();
  const organizations = await db.getAllOrganizations();
  
  const validOrgIds = new Set(organizations.map(org => org.id));
  const errors: string[] = [];

  for (const actor of actors) {
    if (!actor.affiliations || actor.affiliations.length === 0) {
      continue;
    }

    for (const affiliation of actor.affiliations) {
      if (!validOrgIds.has(affiliation)) {
        errors.push(`${actor.name} (${actor.id}) has invalid affiliation: "${affiliation}"`);
      }
    }
  }

  if (errors.length > 0) {
    logger.error('ACTOR VALIDATION FAILED', undefined, 'CLI');
    logger.error('Invalid affiliations found:', errors, 'CLI');
    logger.error('Please fix actor data in database before generating a game.', undefined, 'CLI');
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs();
  
  logger.info('BABYLON GAME GENERATOR', undefined, 'CLI');
  logger.info('==========================', undefined, 'CLI');

  // Validate actors from database
  logger.info('Validating actors from database...', undefined, 'CLI');
  await validateActorsData();
  logger.info('Actors validated', undefined, 'CLI');

  // Validate API key is present
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!groqKey && !openaiKey) {
    logger.error('ERROR: No API key found!', undefined, 'CLI');
    logger.error('This generator requires an LLM API key to function.', undefined, 'CLI');
    logger.error('Set one of the following environment variables:', {
      groq: 'export GROQ_API_KEY=your_groq_key_here',
      openai: 'export OPENAI_API_KEY=your_openai_key_here',
      groqUrl: 'Get a free Groq API key at: https://console.groq.com/',
      openaiUrl: 'Get an OpenAI API key at: https://platform.openai.com/'
    }, 'CLI');
    process.exit(1);
  }

  if (groqKey) {
    logger.info('Using Groq (fast inference)', undefined, 'CLI');
  } else if (openaiKey) {
    logger.info('Using OpenAI', undefined, 'CLI');
  }

  const startTime = Date.now();

  // STEP 0: Check if genesis game exists in database
  logger.info('STEP 0: Checking for genesis game in database...', undefined, 'CLI');
  const existingGames = await db.getAllGames();
  
  if (existingGames.length === 0) {
    logger.info('No genesis game found, generating...', undefined, 'CLI');
    const generator = new GameGenerator();
    const genesis = await generator.generateGenesis();
    
    // Save genesis metadata to database
    // Note: Full game data saved to genesis.json file, not database
    await db.prisma.game.create({
      data: {
        id: generateSnowflakeId(),
        isContinuous: false,
        isRunning: false,
        currentDate: new Date(),
        speed: 60000,
        updatedAt: new Date(),
      },
    });
    
    logger.info('Genesis game saved to database', undefined, 'CLI');
    logger.info(`Total events: ${genesis.timeline.reduce((sum, day) => sum + day.events.length, 0)}`, undefined, 'CLI');
    logger.info(`Total posts: ${genesis.timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`, undefined, 'CLI');
  } else {
    logger.info(`Found ${existingGames.length} existing game(s) in database`, undefined, 'CLI');
  }

  // STEP 1: Load Previous Games
  logger.info('STEP 1: Loading previous games...', undefined, 'CLI');
  
  const history: GameHistory[] = [];
  let nextStartDate: string;
  let gameNumber = 1;

  if (existingGames.length > 0) {
    logger.info(`Found ${existingGames.length} previous game(s):`, undefined, 'CLI');
    
    // Generate history from database games
    const tempGenerator = new GameGenerator();
    for (let i = existingGames.length - 1; i >= 0; i--) {
      const gameData = existingGames[i];
      if (!gameData) continue;

      // This is a placeholder as full game reconstruction is not yet implemented
      const reconstructedGame = {
        id: gameData.id,
        // ... other properties would be reconstructed here
      } as unknown as GeneratedGame;

      const gameHistory = tempGenerator.createGameHistory(reconstructedGame);
      history.push(gameHistory);
    }

    // Calculate next start date
    const lastGame = existingGames[0]!;
    const lastDate = new Date(lastGame.currentDate);
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 30); // 30 days after last game start
    nextStartDate = nextDate.toISOString().split('T')[0]!;

    gameNumber = existingGames.length + 1;
    
    logger.info(`Next game will be #${gameNumber} starting ${nextStartDate}`, undefined, 'CLI');
  } else {
    logger.info('No previous games found. This will be Game #1', undefined, 'CLI');
    
    // First game starts from current actual date
    const now = new Date();
    // Start from first of current month
    nextStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    logger.info(`Starting ${nextStartDate} (current month, first game)`, undefined, 'CLI');
  }

  // STEP 2: Generate New Game
  logger.info(`STEP 2: Generating Game #${gameNumber}...`, undefined, 'CLI');
  logger.info(`Start: ${nextStartDate}`, undefined, 'CLI');
  logger.info('Duration: 30 days', undefined, 'CLI');
  logger.info('Retries enabled - will not give up on LLM failures', undefined, 'CLI');
  
  const generator = new GameGenerator(undefined, history.length > 0 ? history : undefined);
  const game = await generator.generateCompleteGame(nextStartDate);
  const duration = Date.now() - startTime;

  logger.info('Game generation complete!', undefined, 'CLI');
  logger.info(`Duration: ${(duration / 1000).toFixed(1)}s`, undefined, 'CLI');
  logger.info(`Total events: ${game.timeline.reduce((sum, day) => sum + day.events.length, 0)}`, undefined, 'CLI');
  logger.info(`Total feed posts: ${game.timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`, undefined, 'CLI');
  logger.info(`Total group messages: ${Object.values(game.timeline.reduce((acc, day) => {
    Object.entries(day.groupChats).forEach(([groupId, messages]) => {
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId]!.push(...messages);
    });
    return acc;
  }, {} as Record<string, ChatMessage[]>)).flat().length}`);

  // Show scenarios and questions
  logger.info('SCENARIOS & QUESTIONS:', undefined, 'CLI');
  logger.info('=========================', undefined, 'CLI');
  
  game.setup.scenarios.forEach(scenario => {
    logger.info(`${scenario.id}. ${scenario.title}`, undefined, 'CLI');
    logger.info(`   ${scenario.description}`, undefined, 'CLI');
    logger.info(`   Theme: ${scenario.theme}`, undefined, 'CLI');
    
    // Find questions for this scenario
    const scenarioQuestions = game.setup.questions.filter(q => q.scenario === scenario.id);
    if (scenarioQuestions.length > 0) {
      logger.info('   Questions:', undefined, 'CLI');
      scenarioQuestions.forEach(q => {
        const outcomeIcon = q.outcome ? 'YES' : 'NO';
        logger.info(`     ${q.id}. ${q.text}`, undefined, 'CLI');
        logger.info(`        Outcome: ${outcomeIcon} | Rank: ${q.rank}`, undefined, 'CLI');
      });
    }
  });

  // STEP 3: Save Game to Database
  logger.info('STEP 3: Saving game to database...', undefined, 'CLI');
  
  // Generate game history
  const gameHistory = generator.createGameHistory(game);
  
  // Save game metadata to database
  // Note: Game is now stored in database (posts, events, actors)
  const savedGame = await db.prisma.game.create({
    data: {
      id: generateSnowflakeId(),
      isContinuous: false,
      isRunning: false,
      currentDate: new Date(nextStartDate),
      speed: 60000,
      updatedAt: new Date(),
    },
  });
  
  logger.info(`Saved game to database (ID: ${savedGame.id})`, undefined, 'CLI');

  // Show summary
  if (options.verbose) {
    logger.info('GAME SUMMARY', undefined, 'CLI');
    logger.info('================', undefined, 'CLI');
    logger.info(`Game ID: ${game.id}`, undefined, 'CLI');
    logger.info(`Game Number: ${gameNumber}`, undefined, 'CLI');
    logger.info(`Main Actors (${game.setup.mainActors.length}):`, game.setup.mainActors.map(a => `${a.name} (${a.tier})`), 'CLI');
    logger.info(`Questions (${game.setup.questions.length}):`, game.setup.questions.map(q => `${q.id}. ${q.text} - Answer: ${q.outcome ? 'YES' : 'NO'}`), 'CLI');
    logger.info('HIGHLIGHTS:', gameHistory.highlights.slice(0, 5), 'CLI');
    logger.info('TOP MOMENTS:', gameHistory.topMoments.slice(0, 3), 'CLI');
  }

  logger.info('Ready for next game! Run `bun run generate` again in 30 days.', undefined, 'CLI');

  process.exit(0);
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    logger.error('Error:', error.message, 'CLI');
    if (error.stack) {
      logger.error('Stack trace:', error.stack, 'CLI');
    }
    process.exit(1);
  });
}

export { main };
