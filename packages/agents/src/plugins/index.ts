/**
 * Agent Plugins
 *
 * Plugin system for extending agent capabilities
 */

// Main Babylon plugin
export {
  babylonPlugin,
  default as defaultBabylonPlugin,
  initializeBabylonPlugin,
} from './babylon';
export type { BabylonRuntime } from './babylon/types';

// Groq plugin
export { groqPlugin } from './groq';

// Plugin sub-exports
export * from './plugin-autonomy/src';
export * from './plugin-experience/src';
export * from './plugin-trajectory-logger/src';
