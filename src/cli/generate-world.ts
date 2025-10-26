#!/usr/bin/env bun

/**
 * Babylon CLI - Generate Game World
 * 
 * Generates complete game narratives with all NPC actions and events.
 * Shows everything that happens in the game world.
 * 
 * Usage:
 *   bun run src/cli/generate-world.ts --verbose
 *   bun run src/cli/generate-world.ts --outcome=SUCCESS
 *   bun run src/cli/generate-world.ts --save=world.json
 */

import { GameWorld } from '../engine/GameWorld';
import { writeFile } from 'fs/promises';

interface CLIOptions {
  outcome?: 'SUCCESS' | 'FAILURE';
  save?: string;
  verbose?: boolean;
  json?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  args.forEach(arg => {
    if (arg.startsWith('--outcome=')) {
      options.outcome = arg.split('=')[1] as 'SUCCESS' | 'FAILURE';
    } else if (arg.startsWith('--save=')) {
      options.save = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  });

  return options;
}

async function main() {
  const options = parseArgs();
  
  const outcomeValue = options.outcome === 'FAILURE' ? false : true;

  const world = new GameWorld({
    outcome: outcomeValue,
    numNPCs: 8,
    duration: 30,
    verbosity: options.verbose ? 'detailed' : 'normal',
  });

  if (options.verbose && !options.json) {
    console.log('\n🌍 GENERATING BABYLON GAME WORLD');
    console.log('=================================\n');

    world.on('world:started', (event) => {
      console.log(`📜 Question: ${event.data.question}`);
      console.log(`🎯 True Outcome: ${outcomeValue ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
      console.log(`👥 NPCs in world: ${event.data.npcs}\n`);
      console.log('--- TIMELINE ---\n');
    });

    world.on('day:begins', (event) => {
      console.log(`\n📅 DAY ${event.data.day}`);
      console.log('─'.repeat(50));
    });

    world.on('npc:action', (event) => {
      console.log(`  🎭 ${event.npc}: ${event.description}`);
    });

    world.on('npc:conversation', (event) => {
      console.log(`  💬 ${event.description}`);
    });

    world.on('news:published', (event) => {
      console.log(`  📰 ${event.npc}: ${event.description}`);
    });

    world.on('rumor:spread', (event) => {
      console.log(`  🗣️  Rumor: ${event.description}`);
    });

    world.on('clue:revealed', (event) => {
      console.log(`  🔍 ${event.npc}: ${event.description}`);
    });

    world.on('development:occurred', (event) => {
      console.log(`  ⚡ DEVELOPMENT: ${event.description}`);
    });

    world.on('feed:post', (post) => {
      const emoji = post.type === 'news' ? '📰' : 
                   post.type === 'reaction' ? '💬' :
                   post.type === 'thread' ? '🧵' : '📢';
      
      const prefix = post.replyTo ? '    ↳' : '  ';
      console.log(`${prefix}${emoji} ${post.author}: ${post.content}`);
      
      if (post.clueStrength > 0.5) {
        console.log(`${prefix}   [Strong clue: ${post.clueStrength.toFixed(1)}]`);
      }
    });

    world.on('outcome:revealed', (event) => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🎯 FINAL OUTCOME: ${event.data.outcome ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
      console.log(`${'='.repeat(50)}\n`);
    });
  }

  const finalWorld = await world.generate();

  if (options.save) {
    const json = JSON.stringify(finalWorld, null, 2);
    await writeFile(options.save, json);
    
    if (!options.json) {
      console.log(`💾 World saved to: ${options.save}`);
    }
  }

  if (!options.json) {
    console.log(`\n✅ World generation complete`);
    console.log(`   Total events: ${finalWorld.events.length}`);
    console.log(`   NPCs: ${finalWorld.npcs.length}`);
    console.log(`   Days simulated: ${finalWorld.timeline.length}`);
    console.log(`   Final outcome: ${finalWorld.outcome ? 'SUCCESS ✅' : 'FAILURE ❌'}\n`);
  } else {
    console.log(JSON.stringify(finalWorld, null, 2));
  }

  process.exit(0);
}

if (import.meta.main) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { main };

