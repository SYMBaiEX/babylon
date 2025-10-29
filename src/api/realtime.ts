/**
 * Realtime API
 * 
 * Provides access to the running realtime engine.
 * Engine is automatically started in realtime-singleton.ts
 */

import { getRealtimeEngine as getEngine } from '@/lib/realtime-singleton';

/**
 * Get the realtime engine instance (auto-started)
 */
export function getRealtimeEngine() {
  return getEngine();
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
