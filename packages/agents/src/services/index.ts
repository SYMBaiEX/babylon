/**
 * Agent Services
 *
 * Core services for agent lifecycle management, registry, and operations.
 *
 * @packageDocumentation
 */

export * from './AgentPnLService';
export * from './AgentService';
export {
  type IAgentRegistry,
  type IWalletService,
  type ICharacterMappingService,
  type ITrajectoryRecorder,
  type IPredictionPricing,
  type IDbContext,
  type IRedisClient,
  type IServiceContainer,
  setServiceContainer,
  getServiceContainer,
  getService,
} from './interfaces';
export * from './agent-registry.service';
export * from './agent-lock-service';
export * from './npc-bootstrap.service';
