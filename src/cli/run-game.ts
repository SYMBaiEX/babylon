#!/usr/bin/env bun

/**
 * Babylon CLI - Run Game Simulation
 * 
 * Runs autonomous game simulations from the command line
 * Perfect for testing, debugging, and batch analysis
 * 
 * Usage:
 *   bun run src/cli/run-game.ts
 *   bun run src/cli/run-game.ts --outcome=YES --verbose
 *   bun run src/cli/run-game.ts --count=10 --fast
 *   bun run src/cli/run-game.ts --save=game.json
 */

import { GameSimulator } from '../engine/GameSimulator';
import { writeFile } from 'fs/promises';

interface CLIOptions {
  outcome?: 'YES' | 'NO';
  count?: number;
  save?: string;
  fast?: boolean;
  verbose?: boolean;
  json?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  args.forEach(arg => {
    if (arg.startsWith('--outcome=')) {
      options.outcome = arg.split('=')[1] as 'YES' | 'NO';
    } else if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--save=')) {
      options.save = arg.split('=')[1];
    } else if (arg === '--fast') {
      options.fast = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  });

  return options;
}

async function runSingleGame(outcome: boolean, options: CLIOptions) {
  const simulator = new GameSimulator({
    outcome,
    numAgents: 5,
    duration: 30,
  });

  if (options.verbose && !options.json) {
    console.log('\n🎮 BABYLON GAME SIMULATION');
    console.log('==========================\n');

    simulator.on('game:started', (event) => {
      console.log(`Question: ${event.data.question}`);
      console.log(`Predetermined Outcome: ${outcome ? 'YES' : 'NO'}`);
      console.log(`Agents: ${event.data.agents}\n`);
    });

    simulator.on('day:changed', (event) => {
      if (!options.fast) {
        console.log(`[Day ${event.data.day}]`);
      }
    });

    simulator.on('clue:distributed', (event) => {
      if (options.verbose && !options.fast) {
        console.log(`  📨 ${event.agentId}: Received clue (${event.data.tier})`);
      }
    });

    simulator.on('agent:bet', (event) => {
      console.log(`  💰 ${event.agentId}: Bet ${event.data.outcome ? 'YES' : 'NO'} (${event.data.amount} tokens)`);
    });

    simulator.on('market:updated', (event) => {
      if (options.verbose && event.day % 10 === 0) {
        console.log(`  📊 Market: ${event.data.yesOdds}% YES / ${event.data.noOdds}% NO`);
      }
    });

    simulator.on('outcome:revealed', (event) => {
      console.log(`\n🎯 Outcome revealed: ${event.data.outcome ? 'YES' : 'NO'}`);
    });

    simulator.on('game:ended', (event) => {
      console.log(`🏆 Winners: ${event.data.winners.join(', ')}\n`);
    });
  }

  const result = await simulator.runCompleteGame();

  if (options.save) {
    const json = JSON.stringify(result, null, 2);
    await writeFile(options.save, json);
    
    if (!options.json) {
      console.log(`📁 Saved to: ${options.save}`);
    }
  }

  if (!options.json) {
    console.log(`✅ Game complete in ${result.endTime - result.startTime}ms`);
    console.log(`   Events: ${result.events.length}`);
    console.log(`   Winners: ${result.winners.length}/${result.agents.length}`);
  }

  return result;
}

async function main() {
  const options = parseArgs();
  
  const outcomeValue = options.outcome === 'NO' ? false : true;
  const count = options.count || 1;

  if (count === 1) {
    // Single game
    const result = await runSingleGame(outcomeValue, options);
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }
  } else {
    // Batch games
    if (!options.json) {
      console.log(`\n🎮 Running ${count} simulations...\n`);
    }

    const results = [];
    const start = Date.now();

    for (let i = 0; i < count; i++) {
      const outcome = i % 2 === 0; // Alternate YES/NO
      const sim = new GameSimulator({ outcome, numAgents: 5 });
      const result = await sim.runCompleteGame();
      results.push(result);

      if (!options.fast && !options.json) {
        process.stdout.write(`\r[${i + 1}/${count}] ${Math.round((i + 1) / count * 100)}%`);
      }
    }

    const duration = Date.now() - start;

    if (options.json) {
      console.log(JSON.stringify({
        count: results.length,
        duration,
        results: results.map(r => ({
          id: r.id,
          outcome: r.outcome,
          winners: r.winners.length,
          events: r.events.length,
        }))
      }, null, 2));
    } else {
      console.log(`\n\n✅ ${count} games completed`);
      console.log(`   Total time: ${duration}ms`);
      console.log(`   Avg time: ${Math.round(duration / count)}ms/game`);
      
      const yesGames = results.filter(r => r.outcome).length;
      console.log(`   YES outcomes: ${yesGames} (${Math.round(yesGames/count*100)}%)`);
      console.log(`   NO outcomes: ${count - yesGames} (${Math.round((count-yesGames)/count*100)}%)`);
    }
  }

  process.exit(0);
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { main, runSingleGame };

