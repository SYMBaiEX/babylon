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
import { writeFile, readFile, access, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { readFileSync } from 'fs';

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

interface GameFile {
  path: string;
  timestamp: Date;
  game: GeneratedGame;
  history?: GameHistory;
}

/**
 * Load previous games from games/ directory
 * Returns last N games sorted by timestamp (most recent first)
 */
async function loadPreviousGames(maxGames = 3): Promise<GameFile[]> {
  const gamesDir = join(process.cwd(), 'games');
  
  // Ensure games directory exists
  const dirExists = await access(gamesDir).then(() => true).catch(() => false);
  if (!dirExists) {
    return [];
  }

  // Read all game files
  const files = await readdir(gamesDir);
  const gameFiles: GameFile[] = [];

  for (const file of files) {
    // Skip latest.json and history files
    if (file === 'latest.json' || file.includes('.history.')) {
      continue;
    }
    
    if (file.startsWith('game-') && file.endsWith('.json')) {
      const filePath = join(gamesDir, file);
      const content = await readFile(filePath, 'utf-8');
      const game = JSON.parse(content) as GeneratedGame;
      
      // Extract timestamp from filename: game-2025-10-24-153933.json
      const match = file.match(/game-(\d{4})-(\d{2})-(\d{2})-(\d{6})\.json/);
      let timestamp = new Date(game.generatedAt);

      if (match && match[1] && match[2] && match[3] && match[4]) {
        const year = match[1];
        const month = match[2];
        const day = match[3];
        const time = match[4];
        const hours = time.slice(0, 2);
        const minutes = time.slice(2, 4);
        const seconds = time.slice(4, 6);
        timestamp = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
      }

      // Try to load associated history file
      const historyFile = file.replace('.json', '.history.json');
      const historyPath = join(gamesDir, historyFile);
      let history: GameHistory | undefined;
      
      const historyExists = await access(historyPath).then(() => true).catch(() => false);
      if (historyExists) {
        const historyContent = await readFile(historyPath, 'utf-8');
        history = JSON.parse(historyContent);
      }

      gameFiles.push({
        path: filePath,
        timestamp,
        game,
        history
      });
    }
  }

  // Sort by timestamp (most recent first) and return last N
  return gameFiles
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, maxGames);
}

/**
 * Create timestamped filename for new game
 */
function createGameFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `game-${year}-${month}-${day}-${hours}${minutes}${seconds}.json`;
}

/**
 * Validate actors.json before generating game
 */
function validateActorsData(): void {
  const actorsPath = join(process.cwd(), 'data', 'actors.json');
  
  interface Actor {
    id: string;
    name: string;
    affiliations: string[];
  }

  interface Organization {
    id: string;
  }

  interface ActorsData {
    actors: Actor[];
    organizations: Organization[];
  }

  const data: ActorsData = JSON.parse(readFileSync(actorsPath, 'utf-8'));
  const { actors, organizations } = data;
  
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
    console.error('\n❌ ACTOR VALIDATION FAILED\n');
    console.error('Invalid affiliations found:');
    errors.forEach(e => console.error(`  • ${e}`));
    console.error('\nPlease fix actors.json before generating a game.\n');
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs();
  
  console.log('\n🎮 BABYLON GAME GENERATOR');
  console.log('==========================\n');

  // Validate actors.json
  console.log('🔍 Validating actors.json...');
  validateActorsData();
  console.log('   ✅ Actors validated\n');

  // Validate API key is present
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!groqKey && !openaiKey) {
    console.error('❌ ERROR: No API key found!\n');
    console.error('This generator requires an LLM API key to function.');
    console.error('Set one of the following environment variables:\n');
    console.error('  export GROQ_API_KEY=your_groq_key_here');
    console.error('  export OPENAI_API_KEY=your_openai_key_here\n');
    console.error('Get a free Groq API key at: https://console.groq.com/');
    console.error('Get an OpenAI API key at: https://platform.openai.com/\n');
    process.exit(1);
  }

  if (groqKey) {
    console.log('🚀 Using Groq (fast inference)\n');
  } else if (openaiKey) {
    console.log('🤖 Using OpenAI\n');
  }

  const startTime = Date.now();

  // STEP 0: Check for genesis.json, generate if missing
  const genesisPath = join(process.cwd(), 'genesis.json');
  const genesisExists = await access(genesisPath).then(() => true).catch(() => false);
  
  if (!genesisExists) {
    console.log('🌍 STEP 0: Genesis not found, generating...\n');
    const generator = new GameGenerator();
    const genesis = await generator.generateGenesis();
    
    const genesisJson = JSON.stringify(genesis, null, 2);
    await writeFile(genesisPath, genesisJson);
    console.log('   ✓ Saved: genesis.json');
    console.log(`   File size: ${(genesisJson.length / 1024).toFixed(1)} KB`);
    console.log(`   Total events: ${genesis.timeline.reduce((sum, day) => sum + day.events.length, 0)}`);
    console.log(`   Total posts: ${genesis.timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`);
    console.log('\n');
  } else {
    console.log('✓ Genesis found: genesis.json\n');
  }

  // STEP 1: Load Previous Games
  console.log('📚 STEP 1: Loading previous games...');
  const previousGames = await loadPreviousGames(3);
  
  let history: GameHistory[] = [];
  let nextStartDate: string;
  let gameNumber = 1;

  if (previousGames.length > 0) {
    console.log(`   ✓ Found ${previousGames.length} previous game(s):`);
    
    // Load or generate history for each previous game
    const tempGenerator = new GameGenerator();
    for (let i = previousGames.length - 1; i >= 0; i--) {
      const gameFile = previousGames[i];
      if (!gameFile) {
        console.warn(`     ⚠️  Game at index ${i} is undefined, skipping`);
        continue;
      }

      // Use existing history if available, otherwise generate it
      let gameHistory: GameHistory;
      if (gameFile.history) {
        gameHistory = gameFile.history;
      } else {
        gameHistory = tempGenerator.createGameHistory(gameFile.game);
        // If no game number exists, infer it from position
        if (!gameHistory.gameNumber) {
          gameHistory.gameNumber = previousGames.length - i;
        }
      }

      history.push(gameHistory);
      const firstQuestion = gameFile.game.setup.questions[0];
      const questionPreview = firstQuestion ? firstQuestion.text.slice(0, 50) : 'No question';
      console.log(`     • Game #${gameHistory.gameNumber} - ${questionPreview}...`);
    }

    // Calculate next start date: Get last game's last day, add 1 day
    const lastGameFile = previousGames[0];
    if (!lastGameFile) {
      throw new Error('Previous games array is not empty but first element is undefined');
    }

    const lastGame = lastGameFile.game; // Most recent game
    const lastDayData = lastGame.timeline[lastGame.timeline.length - 1];

    if (lastDayData && lastDayData.feedPosts && lastDayData.feedPosts.length > 0) {
      const lastDayPost = lastDayData.feedPosts[0];
      if (lastDayPost) {
        const lastDate = new Date(lastDayPost.timestamp);
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + 1); // Next day after last game
        nextStartDate = nextDate.toISOString().split('T')[0]!;
      } else {
        // Fallback: assume 30 days per game, calculate next month
        const lastGameStart = new Date(lastGame.generatedAt);
        const nextMonth = new Date(lastGameStart);
        nextMonth.setMonth(lastGameStart.getMonth() + 1);
        nextMonth.setDate(1);
        nextStartDate = nextMonth.toISOString().split('T')[0]!;
      }
    } else {
      // Fallback: assume 30 days per game, calculate next month
      const lastGameStart = new Date(lastGame.generatedAt);
      const nextMonth = new Date(lastGameStart);
      nextMonth.setMonth(lastGameStart.getMonth() + 1);
      nextMonth.setDate(1);
      nextStartDate = nextMonth.toISOString().split('T')[0]!;
    }

    const lastHistoryEntry = history[history.length - 1];
    if (!lastHistoryEntry) {
      throw new Error('History array should not be empty after processing previous games');
    }
    gameNumber = lastHistoryEntry.gameNumber + 1;
    
    console.log(`   ✓ Next game will be #${gameNumber} starting ${nextStartDate}\n`);
  } else {
    console.log('   ℹ️ No previous games found. This will be Game #1');
    
    // First game starts from current actual date
    const now = new Date();
    // Start from first of current month
    nextStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    console.log(`   ✓ Starting ${nextStartDate} (current month, first game)\n`);
  }

  // STEP 2: Generate New Game
  console.log(`🎲 STEP 2: Generating Game #${gameNumber}...`);
  console.log(`   Start: ${nextStartDate}`);
  console.log(`   Duration: 30 days`);
  console.log(`   🔄 Retries enabled - will not give up on LLM failures\n`);
  
  const generator = new GameGenerator(undefined, history.length > 0 ? history : undefined);
  const game = await generator.generateCompleteGame(nextStartDate);
  const duration = Date.now() - startTime;

  console.log('\n✅ Game generation complete!');
  console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`   Total events: ${game.timeline.reduce((sum, day) => sum + day.events.length, 0)}`);
  console.log(`   Total feed posts: ${game.timeline.reduce((sum, day) => sum + day.feedPosts.length, 0)}`);
  console.log(`   Total group messages: ${Object.values(game.timeline.reduce((acc, day) => {
    Object.entries(day.groupChats).forEach(([groupId, messages]) => {
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId]!.push(...messages);
    });
    return acc;
  }, {} as Record<string, any[]>)).flat().length}`);

  // Show scenarios and questions
  console.log('\n📋 SCENARIOS & QUESTIONS:');
  console.log('=========================');
  
  game.setup.scenarios.forEach(scenario => {
    console.log(`\n${scenario.id}. ${scenario.title}`);
    console.log(`   ${scenario.description}`);
    console.log(`   Theme: ${scenario.theme}`);
    
    // Find questions for this scenario
    const scenarioQuestions = game.setup.questions.filter(q => q.scenario === scenario.id);
    if (scenarioQuestions.length > 0) {
      console.log(`   Questions:`);
      scenarioQuestions.forEach(q => {
        const outcomeIcon = q.outcome ? '✅ YES' : '❌ NO';
        console.log(`     ${q.id}. ${q.text}`);
        console.log(`        Outcome: ${outcomeIcon} | Rank: ${q.rank}`);
      });
    }
  });

  // STEP 3: Save Game
  console.log('\n💾 STEP 3: Saving game...');
  
  // Create games directory if it doesn't exist
  const gamesDir = join(process.cwd(), 'games');
  await mkdir(gamesDir, { recursive: true });
  
  // Save timestamped game
  const timestamp = new Date();
  const gameFilename = createGameFilename(timestamp);
  const gamePath = join(gamesDir, gameFilename);
  const gameJson = JSON.stringify(game, null, 2);
  await writeFile(gamePath, gameJson);
  console.log(`   ✓ Saved: games/${gameFilename}`);
  console.log(`   File size: ${(gameJson.length / 1024).toFixed(1)} KB`);
  
  // Update latest.json
  const latestPath = join(gamesDir, 'latest.json');
  await writeFile(latestPath, gameJson);
  console.log(`   ✓ Updated: games/latest.json`);

  // Generate and save history summary
  const gameHistory = generator.createGameHistory(game);
  
  // Save history alongside game
  const historyFilename = gameFilename.replace('.json', '.history.json');
  const historyPath = join(gamesDir, historyFilename);
  await writeFile(historyPath, JSON.stringify(gameHistory, null, 2));
  console.log(`   ✓ History: games/${historyFilename}`);

  // Show summary
  if (options.verbose) {
    console.log('\n📊 GAME SUMMARY');
    console.log('================');
    console.log(`Game ID: ${game.id}`);
    console.log(`Game Number: ${gameNumber}`);
    console.log(`\nMain Actors (${game.setup.mainActors.length}):`);
    game.setup.mainActors.forEach(a => {
      console.log(`  • ${a.name} (${a.tier})`);
    });
    console.log(`\nQuestions (${game.setup.questions.length}):`);
    game.setup.questions.forEach(q => {
      console.log(`  ${q.id}. ${q.text}`);
      console.log(`     Answer: ${q.outcome ? 'YES' : 'NO'}`);
    });
    console.log('\n📋 HIGHLIGHTS:');
    gameHistory.highlights.slice(0, 5).forEach(h => {
      console.log(`  • ${h}`);
    });
    console.log('\n🔥 TOP MOMENTS:');
    gameHistory.topMoments.slice(0, 3).forEach(m => {
      console.log(`  • ${m}`);
    });
  }

  console.log('\n🎉 Ready for next game! Run `bun run generate` again in 30 days.\n');

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
