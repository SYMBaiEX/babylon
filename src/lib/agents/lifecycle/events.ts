/**
 * Agent Lifecycle Event Definitions
 * 
 * Standardized events for tracking agent state changes across protocols.
 */

export enum AgentLifecycleEvent {
  // Registration Events
  REGISTERED = 'agent:registered',
  WALLET_CREATED = 'agent:wallet_created',
  AGENT0_REGISTERED = 'agent:agent0_registered',
  
  // Connection Events
  CONNECTED_A2A = 'agent:connected_a2a',
  DISCONNECTED_A2A = 'agent:disconnected_a2a',
  AUTHENTICATED_MCP = 'agent:authenticated_mcp',
  
  // State Changes
  ACTIVATED = 'agent:activated',
  DEACTIVATED = 'agent:deactivated',
  TRANSFERRED = 'agent:transferred',
  BANNED = 'agent:banned',
  UNBANNED = 'agent:unbanned',
  
  // Performance Events
  REPUTATION_UPDATED = 'agent:reputation_updated',
  FEEDBACK_RECEIVED = 'agent:feedback_received',
  TRADE_EXECUTED = 'agent:trade_executed',
  
  // Configuration Events
  CAPABILITIES_UPDATED = 'agent:capabilities_updated',
  METADATA_UPDATED = 'agent:metadata_updated'
}

export interface AgentLifecycleEventData {
  agentId: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface AgentRegisteredEvent extends AgentLifecycleEventData {
  tokenId: number
  walletAddress: string
}

export interface Agent0RegisteredEvent extends AgentLifecycleEventData {
  agent0TokenId: number
  metadataCID?: string
  txHash?: string
}

export interface AgentConnectedA2AEvent extends AgentLifecycleEventData {
  endpoint: string
  sessionToken: string
}

export interface AgentTransferredEvent extends AgentLifecycleEventData {
  fromOwner: string
  toOwner: string
  txHash: string
}

export interface ReputationUpdatedEvent extends AgentLifecycleEventData {
  oldScore: number
  newScore: number
  source: 'local' | 'agent0' | 'aggregated'
}

export interface FeedbackReceivedEvent extends AgentLifecycleEventData {
  feedbackId: string
  rating: number
  fromAgent: string
}

