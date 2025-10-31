/**
 * @babylonai/plugin-babylon
 *
 * ElizaOS plugin for autonomous AI agents to participate in Babylon prediction markets
 * Following latest ElizaOS plugin architecture patterns
 */

// Import plugin and services first
import {
  predictionMarketsPlugin,
  BabylonClientService,
  BabylonTradingService,
} from "./plugin";

// Export plugin and services (following quick-starter pattern)
export { predictionMarketsPlugin, BabylonClientService, BabylonTradingService };

// Export types and utilities for external use
export * from "./types";
export * from "./api-client";
export * from "./agent-auth-service";
export * from "./actions/actions";
export * from "./evaluators/evaluators";
export * from "./providers/providers";
export * from "./environment";

// Legacy exports for backward compatibility
export const babylonGamePlugin = predictionMarketsPlugin;

// Default export
export default predictionMarketsPlugin;
