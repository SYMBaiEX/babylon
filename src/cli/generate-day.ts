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
import type { GameState, DayTimeline } from '@/shared/types';

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
    console.error('Failed to load game state:', error);
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
 * Load all actors/scenarios/etc for continuous generation
 */
async function loadGameAssets(state: GameState) {
  // This would load the persisted actors, scenarios, connections, etc.
  // For now, return placeholder - in real implementation, save these during initialization
  return {
    allActors: [],
    scenarios: [],
    groupChats: [],
    connections: [],
    luckMood: new Map(),
    previousDays: [],
  };
}

async function main() {
  const options = parseArgs();

  console.log('\n🎮 BABYLON DAILY GENERATOR');
  console.log('===========================\n');

  // Validate API key
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    console.error('❌ ERROR: No API key found!\n');
    console.error('Set GROQ_API_KEY or OPENAI_API_KEY environment variable.\n');
    process.exit(1);
  }

  const generator = new ContinuousGameGenerator();

  // OPTION 1: Initialize new game
  if (options.init) {
    console.log('🌍 INITIALIZING NEW GAME\n');

    const gameState = await generator.initializeGame('2025-11-01');
    await saveGameState(gameState);

    console.log('✅ Game initialized successfully!');
    console.log(`   Game ID: ${gameState.id}`);
    console.log(`   Start Date: ${gameState.currentDate}`);
    console.log(`   Active Questions: ${gameState.activeQuestions.length}\n`);

    return;
  }

  // OPTION 2: Generate next day(s)
  const existingState = await loadGameState();

  if (!existingState) {
    console.error('❌ No game state found. Run with --init to create a new game.\n');
    process.exit(1);
  }

  console.log(`📊 LOADED GAME STATE`);
  console.log(`   Game ID: ${existingState.id}`);
  console.log(`   Current Day: ${existingState.currentDay}`);
  console.log(`   Current Date: ${existingState.currentDate}`);
  console.log(`   Active Questions: ${existingState.activeQuestions.length}/20`);
  console.log(`   Resolved Questions: ${existingState.resolvedQuestions.length}\n`);

  // Load game assets (actors, scenarios, etc.)
  const assets = await loadGameAssets(existingState);

  // Generate requested number of days
  let currentState = existingState;

  for (let i = 0; i < (options.days || 1); i++) {
    const { dayTimeline, updatedGameState } = await generator.generateNextDay(
      currentState,
      assets.allActors,
      assets.scenarios,
      assets.groupChats,
      assets.connections,
      assets.luckMood,
      assets.previousDays
    );

    // Save day timeline
    await saveDayTimeline(updatedGameState.currentDay, dayTimeline);
    console.log(`   ✓ Saved day ${updatedGameState.currentDay} timeline\n`);

    // Save updated state
    await saveGameState(updatedGameState);

    currentState = updatedGameState;
    assets.previousDays.push(dayTimeline);

    if (i < (options.days || 1) - 1) {
      console.log(''); // Blank line between days
    }
  }

  console.log('✅ GENERATION COMPLETE');
  console.log(`   Days Generated: ${options.days}`);
  console.log(`   Current Day: ${currentState.currentDay}`);
  console.log(`   Active Questions: ${currentState.activeQuestions.length}/20`);
  console.log(`   Resolved Questions: ${currentState.resolvedQuestions.length}\n`);

  process.exit(0);
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

export { main };


