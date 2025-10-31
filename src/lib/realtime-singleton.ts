/**
 * Realtime Game Engine Singleton
 * 
 * Auto-starts enhanced question-driven engine when Next.js server starts.
 */

import { RealtimeGameEngine } from '@/engine/RealtimeGameEngine';

let engineInstance: RealtimeGameEngine | null = null;
let isInitialized = false;

export function getRealtimeEngine(): RealtimeGameEngine {
  if (!engineInstance) {
    engineInstance = new RealtimeGameEngine({
      tickIntervalMs: 60000, // 1 minute ticks
      postsPerTick: 12,      // 12 LLM-generated posts per minute
      historyDays: 30,
    });
  }
  
  return engineInstance;
}

export async function initializeRealtimeEngine(): Promise<void> {
  if (isInitialized) {
    console.log('⚠️  Engine already initialized');
    return;
  }

  console.log('\n🎮 STARTING BABYLON ENHANCED ENGINE\n');

  try {
    const engine = getRealtimeEngine();
    await engine.initialize();
    engine.start();
    
    isInitialized = true;
    
    console.log('\n✅ ENHANCED ENGINE RUNNING\n');
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

export function stopRealtimeEngine(): void {
  if (engineInstance && isInitialized) {
    engineInstance.stop();
    isInitialized = false;
  }
}

// Auto-start on module load (server-side only)
if (typeof window === 'undefined') {
  initializeRealtimeEngine().catch((error) => {
    console.error('Failed to start engine:', error);
  });
}

