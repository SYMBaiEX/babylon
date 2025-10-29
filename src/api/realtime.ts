/**
 * Realtime API
 * 
 * Provides access to the running realtime engine.
 * In production, this would be HTTP/WebSocket endpoints.
 * For now, it's a module export that can be imported.
 */

import { RealtimeGameEngine } from '@/engine/RealtimeGameEngine';

// Global singleton instance
let engineInstance: RealtimeGameEngine | null = null;

/**
 * Get or create the realtime engine instance
 */
export function getRealtimeEngine(): RealtimeGameEngine {
  if (!engineInstance) {
    engineInstance = new RealtimeGameEngine({
      tickIntervalMs: 60000, // 1 minute
      postsPerTick: 15,
      historyDays: 30,
    });
  }
  
  return engineInstance;
}

/**
 * Initialize and start the engine
 */
export async function startRealtimeEngine(): Promise<void> {
  const engine = getRealtimeEngine();
  
  if (!engine.getState().isRunning) {
    await engine.initialize();
    engine.start();
  }
}

/**
 * Stop the engine
 */
export function stopRealtimeEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
  }
}

/**
 * Get markets data for UI
 */
export function getMarketsData() {
  const engine = getRealtimeEngine();
  const perpsEngine = engine.getPerpsEngine();
  
  return {
    markets: perpsEngine.getMarkets(),
    questions: engine.getAllQuestions(),
    organizations: engine.getAllOrganizations(),
  };
}

/**
 * Get user positions
 */
export function getUserPositions(userId: string) {
  const engine = getRealtimeEngine();
  const perpsEngine = engine.getPerpsEngine();
  
  return perpsEngine.getUserPositions(userId);
}

/**
 * Open a new position
 */
export function openPosition(userId: string, order: any) {
  const engine = getRealtimeEngine();
  const perpsEngine = engine.getPerpsEngine();
  
  return perpsEngine.openPosition(userId, order);
}

/**
 * Close a position
 */
export function closePosition(positionId: string) {
  const engine = getRealtimeEngine();
  const perpsEngine = engine.getPerpsEngine();
  
  return perpsEngine.closePosition(positionId);
}

/**
 * Get daily price snapshots for charting
 */
export function getDailySnapshots(ticker: string, days: number = 30) {
  const engine = getRealtimeEngine();
  const perpsEngine = engine.getPerpsEngine();
  
  return perpsEngine.getDailySnapshots(ticker, days);
}

