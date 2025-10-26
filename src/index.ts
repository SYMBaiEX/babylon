/**
 * @babylon/game-engine
 * 
 * Pure game logic package - NO server dependencies
 * Can be used standalone for simulations, testing, or analysis
 * 
 * @example Server usage
 * ```typescript
 * import { GameSimulator } from '@babylon/game-engine';
 * 
 * const game = new GameSimulator({ outcome: true });
 * const result = await game.runCompleteGame();
 * ```
 * 
 * @example CLI usage
 * ```bash
 * bun run @babylon/game-engine/cli --verbose
 * ```
 * 
 * @example Viewer usage
 * ```bash
 * bun run @babylon/game-engine/viewer
 * ```
 */

// Core game engine
export { GameSimulator, type GameConfig, type GameResult, type GameEvent, type GameEventType, type AgentState, type MarketState, type ReputationChange } from './engine/GameSimulator';

// Re-export for convenience
export * from './engine/GameSimulator';

