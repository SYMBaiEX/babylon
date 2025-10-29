/**
 * Realtime Game Engine Singleton
 * 
 * Automatically starts when Next.js dev server starts.
 * Runs continuously generating content for current time and beyond.
 */

import { RealtimeGameEngine } from '@/engine/RealtimeGameEngine';

let engineInstance: RealtimeGameEngine | null = null;
let isInitialized = false;

/**
 * Get or create the realtime engine instance
 */
export function getRealtimeEngine(): RealtimeGameEngine {
  if (!engineInstance) {
    engineInstance = new RealtimeGameEngine({
      tickIntervalMs: 60000, // 1 minute ticks
      postsPerTick: 15,
      historyDays: 30,
    });
  }
  
  return engineInstance;
}

/**
 * Initialize and start the engine automatically
 * Called when Next.js server starts
 */
export async function initializeRealtimeEngine(): Promise<void> {
  if (isInitialized) {
    console.log('⚠️  Realtime engine already initialized');
    return;
  }

  console.log('\n🎮 INITIALIZING BABYLON REALTIME ENGINE\n');

  try {
    const engine = getRealtimeEngine();
    
    // Initialize the engine
    await engine.initialize();
    
    // Start generating content
    engine.start();
    
    isInitialized = true;
    
    console.log('\n✅ BABYLON REALTIME ENGINE STARTED\n');
    console.log('📊 Game state:');
    console.log(engine.getState());
    console.log('\n🔥 Generating real-time content...\n');
  } catch (error) {
    console.error('❌ Failed to initialize realtime engine:', error);
    throw error;
  }
}

/**
 * Stop the engine (for graceful shutdown)
 */
export function stopRealtimeEngine(): void {
  if (engineInstance && isInitialized) {
    engineInstance.stop();
    isInitialized = false;
    console.log('\n🛑 Realtime engine stopped\n');
  }
}

// Initialize on module load (when Next.js starts)
if (typeof window === 'undefined') {
  // Server-side only
  initializeRealtimeEngine().catch((error) => {
    console.error('Failed to start realtime engine:', error);
  });
}


