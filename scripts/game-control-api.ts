#!/usr/bin/env bun
/**
 * Game Control (API)
 * 
 * Control game via API endpoint (works for production)
 * 
 * Usage:
 *   bun run scripts/game-control-api.ts status  - Check game status
 *   bun run scripts/game-control-api.ts start   - Start the game (requires ADMIN_TOKEN)
 *   bun run scripts/game-control-api.ts pause  - Pause the game (requires ADMIN_TOKEN)
 * 
 * Environment Variables:
 *   API_URL - Base URL for API (default: http://localhost:3000)
 *   ADMIN_TOKEN - Admin token for POST requests (required for start/pause)
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function getStatus() {
  try {
    const response = await fetch(`${API_URL}/api/game/control`);
    const data = await response.json();
    
    if (!data.success) {
      console.error('❌ Failed to get game status:', data);
      process.exit(1);
    }
    
    if (!data.game) {
      console.log('⚠️  No game found. Use POST /api/game/control to create and start a game.');
      console.log('\nTo start via API:');
      console.log(`  curl -X POST ${API_URL}/api/game/control \\`);
      console.log(`    -H "Content-Type: application/json" \\`);
      console.log(`    -H "x-admin-token: \${ADMIN_TOKEN}" \\`);
      console.log(`    -d '{"action":"start"}'`);
      return;
    }
    
    const game = data.game;
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Game Status');
    console.log('═'.repeat(60));
    console.log(`   Status: ${game.isRunning ? '✅ RUNNING' : '⏸️  PAUSED'}`);
    console.log(`   Current Day: ${game.currentDay}`);
    console.log(`   Current Date: ${game.currentDate ? new Date(game.currentDate).toLocaleString() : 'N/A'}`);
    console.log(`   Active Questions: ${game.activeQuestions || 0}`);
    console.log(`   Speed: ${game.speed || 60000}ms between ticks`);
    console.log(`   Last Tick: ${game.lastTickAt ? new Date(game.lastTickAt).toLocaleString() : 'Never'}`);
    
    if (game.startedAt) {
      console.log(`   Started At: ${new Date(game.startedAt).toLocaleString()}`);
    }
    
    if (game.pausedAt) {
      console.log(`   Paused At: ${new Date(game.pausedAt).toLocaleString()}`);
    }
    
    console.log('═'.repeat(60));
    console.log('');
    
    if (!game.isRunning) {
      console.log('💡 To start the game:');
      if (ADMIN_TOKEN) {
        console.log(`   bun run scripts/game-control-api.ts start`);
      } else {
        console.log(`   curl -X POST ${API_URL}/api/game/control \\`);
        console.log(`     -H "Content-Type: application/json" \\`);
        console.log(`     -H "x-admin-token: \${ADMIN_TOKEN}" \\`);
        console.log(`     -d '{"action":"start"}'`);
      }
    } else {
      console.log('✅ Game is running! Cron should be executing ticks.');
    }
  } catch (error) {
    console.error('❌ Error checking game status:', error);
    process.exit(1);
  }
}

async function controlGame(action: 'start' | 'pause') {
  if (!ADMIN_TOKEN) {
    console.error('❌ ADMIN_TOKEN environment variable is required for start/pause operations');
    console.error('   Set ADMIN_TOKEN in your environment or pass it as an env var');
    process.exit(1);
  }
  
  try {
    const response = await fetch(`${API_URL}/api/game/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': ADMIN_TOKEN,
      },
      body: JSON.stringify({ action }),
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.error(`❌ Failed to ${action} game:`, data);
      process.exit(1);
    }
    
    console.log(`✅ Game ${action === 'start' ? 'started' : 'paused'}!`);
    console.log(`   Game ID: ${data.game.id}`);
    console.log(`   Status: ${data.game.isRunning ? 'RUNNING' : 'PAUSED'}`);
    console.log(`   Current Day: ${data.game.currentDay}`);
    
    if (action === 'start') {
      console.log('\n🎮 Game is now running. Cron will execute ticks every minute.');
    }
  } catch (error) {
    console.error(`❌ Error ${action}ing game:`, error);
    process.exit(1);
  }
}

async function main() {
  const action = process.argv[2];
  
  if (!action) {
    console.log('Usage:');
    console.log('  bun run scripts/game-control-api.ts status  - Check game status');
    console.log('  bun run scripts/game-control-api.ts start   - Start the game (requires ADMIN_TOKEN)');
    console.log('  bun run scripts/game-control-api.ts pause   - Pause the game (requires ADMIN_TOKEN)');
    console.log('');
    console.log('Environment Variables:');
    console.log('  API_URL - Base URL for API (default: http://localhost:3000)');
    console.log('  ADMIN_TOKEN - Admin token for POST requests (required for start/pause)');
    process.exit(1);
  }
  
  switch (action) {
    case 'start':
      await controlGame('start');
      break;
    case 'pause':
      await controlGame('pause');
      break;
    case 'status':
      await getStatus();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      console.log('Valid actions: start, pause, status');
      process.exit(1);
  }
}

main();

