/**
 * Game Engine Singleton
 * 
 * Auto-starts question-driven game engine when Next.js server starts.
 */

import { GameEngine } from '@/engine/GameEngine';

let engineInstance: GameEngine | null = null;
let isInitialized = false;

export function getGameEngine(): GameEngine {
  if (!engineInstance) {
    engineInstance = new GameEngine({
      tickIntervalMs: 60000, // 1 minute ticks
      postsPerTick: 12,      // 12 LLM-generated posts per minute
      historyDays: 30,
    });
  }
  
  return engineInstance;
}

export async function initializeGameEngine(): Promise<void> {
  if (isInitialized) {
    console.log('⚠️  Engine already initialized');
    return;
  }

  console.log('\n🎮 STARTING BABYLON ENGINE\n');

  try {
    const engine = getGameEngine();
    await engine.initialize();
    engine.start();
    
    isInitialized = true;
    
    console.log('\n✅ ENGINE RUNNING\n');
    console.log('📊 Features:');
    console.log('  ✓ LLM-generated events specific to questions');
    console.log('  ✓ Actor posts with real content');
    console.log('  ✓ Time-aware clue strength');
    console.log('  ✓ Resolution events with proof');
    console.log('  ✓ Group chats discussing predictions');
    console.log('  ✓ Price movements linked to outcomes\n');
  } catch (error) {
    console.error('❌ Failed to initialize engine:', error);
    throw error;
  }
}

export function stopGameEngine(): void {
  if (engineInstance && isInitialized) {
    engineInstance.stop();
    isInitialized = false;
  }
}

// Auto-start on module load (server-side only)
if (typeof window === 'undefined') {
  initializeGameEngine().catch((error) => {
    console.error('Failed to start engine:', error);
  });
}

