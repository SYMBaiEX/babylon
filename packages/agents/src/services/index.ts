/**
 * Agent Services
 *
 * Core services for agent management
 */

export * from './AgentPnLService';
export * from './AgentService';
// Export interfaces but exclude IAgent0Client to avoid conflict with agent0/index.ts
export {
  type IAgentRegistry,
  type IWalletService,
  type ICharacterMappingService,
  type ITrajectoryRecorder,
  type IPerpTradeService,
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
