/**
 * Game Engine Singleton
 * 
 * Auto-starts question-driven game engine when Next.js server starts.
 */

import { GameEngine } from '@/engine/GameEngine';
import { logger } from '@/lib/logger';

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
    logger.warn('Engine already initialized', undefined, 'GameEngineSingleton');
    return;
  }

  logger.info('STARTING BABYLON ENGINE', undefined, 'GameEngineSingleton');

  try {
    const engine = getGameEngine();
    await engine.initialize();
    engine.start();
    
    isInitialized = true;
    
    logger.info('ENGINE RUNNING', undefined, 'GameEngineSingleton');
    logger.info('Features enabled:', {
      features: [
        'LLM-generated events specific to questions',
        'Actor posts with real content',
        'Time-aware clue strength',
        'Resolution events with proof',
        'Group chats discussing predictions',
        'Price movements linked to outcomes'
      ]
    }, 'GameEngineSingleton');
  } catch (error) {
    logger.error('Failed to initialize engine:', error, 'GameEngineSingleton');
    throw error;
  }
}

export function stopGameEngine(): void {
  if (engineInstance && isInitialized) {
    engineInstance.stop();
    isInitialized = false;
  }
}

// NOTE: Auto-start removed to prevent initialization during Next.js build
// The engine should be started manually via API route or CLI daemon

