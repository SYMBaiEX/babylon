#!/usr/bin/env bun

/**
 * Babylon CLI - Daily Game Generator
 * 
 * Generates game content one day at a time for continuous gameplay.
 * Manages active questions (max 20), creates new questions daily,
 * resolves questions when they expire, and updates stock prices.
 * 
 * Flow:
 * 1. Check for existing game-state.json
 * 2. If no state: Initialize new game
 * 3. If state exists: Load and generate next day
 * 4. Save updated state and daily timeline
 * 5. Can be run daily or multiple times for bulk generation
 * 
 * Requirements:
 * - GROQ_API_KEY or OPENAI_API_KEY environment variable must be set
 * 
 * Usage:
 *   bun run generate:day              (generate next day)
 *   bun run generate:day --init       (initialize new game)
 *   bun run generate:day --days 7     (generate 7 days at once)
 *   bun run generate:day --verbose    (show detailed output)
 */

import { ContinuousGameGenerator } from '../engine/ContinuousGameGenerator';
import { writeFile, readFile, access, mkdir } from 'fs/promises';
import { join } from 'path';
import type { GameState, DayTimeline, Actor, SelectedActor, Scenario, GroupChat, ActorConnection } from '@/shared/types';
import { logger } from '@/lib/logger';

interface CLIOptions {
  verbose?: boolean;
  init?: boolean;
  days?: number;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = { days: 1 };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--init') {
      options.init = true;
    } else if (arg === '--days' || arg === '-d') {
      const nextArg = args[i + 1];
      if (nextArg) {
        options.days = parseInt(nextArg, 10);
        i++;
      }
    }
  }

  return options;
}

/**
 * Load existing game state
 */
async function loadGameState(): Promise<GameState | null> {
  const statePath = join(process.cwd(), 'games', 'game-state.json');

  try {
    const exists = await access(statePath).then(() => true).catch(() => false);
    if (!exists) return null;

    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as GameState;
  } catch (error) {
    logger.error('Failed to load game state:', error, 'CLI');
    return null;
  }
}

/**
 * Save game state
 */
async function saveGameState(state: GameState): Promise<void> {
  const gamesDir = join(process.cwd(), 'games');
  await mkdir(gamesDir, { recursive: true });

  const statePath = join(gamesDir, 'game-state.json');
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * Save daily timeline
 */
async function saveDayTimeline(day: number, timeline: DayTimeline): Promise<void> {
  const gamesDir = join(process.cwd(), 'games', 'daily');
  await mkdir(gamesDir, { recursive: true });

  const dayPath = join(gamesDir, `day-${String(day).padStart(3, '0')}.json`);
  await writeFile(dayPath, JSON.stringify(timeline, null, 2));
}

/**
 * Save game assets (actors, scenarios, connections, etc.)
 */
interface GameAssets {
  allActors: Actor[];
  scenarios: Scenario[];
  groupChats: GroupChat[];
  connections: ActorConnection[];
  luckMood: Map<string, { luck: string; mood: number }>;
}

async function saveGameAssets(assets: GameAssets): Promise<void> {
  const gamesDir = join(process.cwd(), 'games');
  await mkdir(gamesDir, { recursive: true });

  const assetsPath = join(gamesDir, 'game-assets.json');

  // Convert Map to object for JSON serialization
  const luckMoodObj: Record<string, { luck: string; mood: number }> = {};
  assets.luckMood.forEach((value, key) => {
    luckMoodObj[key] = value;
  });

  await writeFile(assetsPath, JSON.stringify({
    allActors: assets.allActors,
    scenarios: assets.scenarios,
    groupChats: assets.groupChats,
    connections: assets.connections,
    luckMood: luckMoodObj,
  }, null, 2));
}

/**
 * Load all actors/scenarios/etc for continuous generation
 */
async function loadGameAssets(state: GameState) {
  const assetsPath = join(process.cwd(), 'games', 'game-assets.json');

  // Load saved assets
  let savedAssets;
  try {
    const exists = await access(assetsPath).then(() => true).catch(() => false);
    if (exists) {
      const content = await readFile(assetsPath, 'utf-8');
      savedAssets = JSON.parse(content);
    }
  } catch (error) {
    logger.error('Failed to load game assets:', error, 'CLI');
  }

  // Convert luckMood object back to Map
  const luckMood = new Map<string, { luck: string; mood: number }>();
  if (savedAssets?.luckMood && typeof savedAssets.luckMood === 'object') {
    Object.entries(savedAssets.luckMood).forEach(([key, value]: [string, unknown]) => {
      if (value && typeof value === 'object' && 'luck' in value && 'mood' in value) {
        const luckMoodValue = value as { luck: string; mood: number };
        luckMood.set(key, luckMoodValue);
      }
    });
  }

  // Load previous days' timelines (last 5 days for context)
  const previousDays: DayTimeline[] = [];
  const dailyDir = join(process.cwd(), 'games', 'daily');
  const startDay = Math.max(1, state.currentDay - 4); // Last 5 days

  for (let day = startDay; day <= state.currentDay; day++) {
    try {
      const dayPath = join(dailyDir, `day-${String(day).padStart(3, '0')}.json`);
      const exists = await access(dayPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await readFile(dayPath, 'utf-8');
        const timeline = JSON.parse(content) as DayTimeline;
        previousDays.push(timeline);
      }
    } catch (error) {
      logger.warn(`Could not load day ${day} timeline:`, error, 'CLI');
    }
  }

  return {
    allActors: (savedAssets?.allActors as Actor[]) || [],
    scenarios: (savedAssets?.scenarios as Scenario[]) || [],
    groupChats: (savedAssets?.groupChats as GroupChat[]) || [],
    connections: (savedAssets?.connections as ActorConnection[]) || [],
    luckMood,
    previousDays,
  };
}

async function main() {
  const options = parseArgs();

  logger.info('BABYLON DAILY GENERATOR', undefined, 'CLI');
  logger.info('===========================', undefined, 'CLI');

  // Validate API key
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    logger.error('ERROR: No API key found!', undefined, 'CLI');
    logger.error('Set GROQ_API_KEY or OPENAI_API_KEY environment variable.', undefined, 'CLI');
    process.exit(1);
  }

  const generator = new ContinuousGameGenerator();

  // OPTION 1: Initialize new game
  if (options.init) {
    logger.info('INITIALIZING NEW GAME', undefined, 'CLI');

    const { gameState, assets } = await generator.initializeGame('2025-11-01');

    // Save game state
    await saveGameState(gameState);

    // Save game assets for future days
    await saveGameAssets(assets);

    logger.info('Game initialized successfully!', {
      gameId: gameState.id,
      startDate: gameState.currentDate,
      activeQuestions: gameState.activeQuestions.length,
      actors: assets.allActors.length,
      scenarios: assets.scenarios.length,
      groupChats: assets.groupChats.length
    }, 'CLI');

    return;
  }

  // OPTION 2: Generate next day(s)
  const existingState = await loadGameState();

  if (!existingState) {
    logger.error('No game state found. Run with --init to create a new game.', undefined, 'CLI');
    process.exit(1);
  }

  logger.info('LOADED GAME STATE', {
    gameId: existingState.id,
    currentDay: existingState.currentDay,
    currentDate: existingState.currentDate,
    activeQuestions: `${existingState.activeQuestions.length}/20`,
    resolvedQuestions: existingState.resolvedQuestions.length
  }, 'CLI');

  // Load game assets (actors, scenarios, etc.)
  const assets = await loadGameAssets(existingState);

  // Generate requested number of days
  let currentState = existingState;

  for (let i = 0; i < (options.days || 1); i++) {
    const { dayTimeline, updatedGameState } = await generator.generateNextDay(
      currentState,
      assets.allActors as SelectedActor[],
      assets.scenarios,
      assets.groupChats,
      assets.connections,
      assets.luckMood,
      assets.previousDays
    );

    // Save day timeline
    await saveDayTimeline(updatedGameState.currentDay, dayTimeline);
    logger.info(`Saved day ${updatedGameState.currentDay} timeline`, undefined, 'CLI');

    // Save updated state
    await saveGameState(updatedGameState);

    // Save updated assets (luck/mood changes are persisted)
    await saveGameAssets(assets);

    currentState = updatedGameState;
    assets.previousDays.push(dayTimeline);
  }

  logger.info('GENERATION COMPLETE', {
    daysGenerated: options.days,
    currentDay: currentState.currentDay,
    activeQuestions: `${currentState.activeQuestions.length}/20`,
    resolvedQuestions: currentState.resolvedQuestions.length
  }, 'CLI');

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


