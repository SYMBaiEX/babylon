/**
 * Unified Agent Registry Type Definitions
 * Based on: ERC-8004, Agent0 SDK, A2A Protocol
 *
 * @see agent-unified-architecture.md for architecture details
 * @see agent-code-examples.md for implementation examples
 */

import type { AgentCapabilities } from './a2a';

// Re-export AgentCapabilities for convenience
export type { AgentCapabilities };

/**
 * Agent types supported by the registry
 * @see ERC-8004 Identity Registry for on-chain agent types
 */
export enum AgentType {
  /** User-controlled agents created via /api/agents */
  USER_CONTROLLED = 'USER_CONTROLLED',

  /** Internal NPC agents loaded from ActorData */
  NPC = 'NPC',

  /** External agents from ElizaOS, MCP, Agent0, custom frameworks */
  EXTERNAL = 'EXTERNAL',
}

/**
 * Agent lifecycle status
 * Maps to AgentRuntime lifecycle: init → active → paused → terminated
 */
export enum AgentStatus {
  /** Registry entry created, runtime not yet initialized */
  REGISTERED = 'REGISTERED',

  /** AgentRuntime instance created and cached */
  INITIALIZED = 'INITIALIZED',

  /** Agent actively participating in game ticks */
  ACTIVE = 'ACTIVE',

  /** Temporarily paused, runtime cached but inactive */
  PAUSED = 'PAUSED',

  /** Runtime destroyed, agent no longer operational */
  TERMINATED = 'TERMINATED',
}

/**
 * Agent trust levels based on verification
 * @see Agent0 SDK trust verification patterns
 */
export enum TrustLevel {
  /** Unverified external agent, limited capabilities */
  UNTRUSTED = 0,

  /** Basic verification complete */
  BASIC = 1,

  /** On-chain ERC-8004 registration verified */
  VERIFIED = 2,

  /** Agent0 SDK verified with reputation score */
  TRUSTED = 3,

  /** First-party NPC or admin-approved agent */
  SYSTEM = 4,
}

/**
 * A2A Agent Card for discovery
 * @see A2A Protocol specification
 * @see https://github.com/google/a2a
 */
export interface AgentCard {
  /** Agent card schema version */
  version: '1.0';

  /** Unique agent identifier */
  agentId: string;

  /** Human-readable name */
  name: string;

  /** Agent description */
  description: string;

  /** Communication endpoints */
  endpoints: {
    /** A2A WebSocket endpoint */
    a2a?: string;

    /** MCP HTTP endpoint */
    mcp?: string;

    /** Custom RPC endpoint */
    rpc?: string;
  };

  /** Capability declaration */
  capabilities: AgentCapabilities;

  /** Authentication requirements */
  authentication?: {
    required: boolean;
    methods: ('apiKey' | 'oauth' | 'wallet')[];
  };

  /** Usage limits and pricing */
  limits?: {
    rateLimit?: number;
    costPerAction?: number;
  };
}

/**
 * On-chain registration data (ERC-8004)
 * @see Base Sepolia contracts
 */
export interface OnChainRegistration {
  /** ERC-8004 NFT token ID */
  tokenId: number;

  /** Registration transaction hash */
  txHash: string;

  /** Server wallet that registered (owns NFT) */
  serverWallet: string;

  /** Reputation score (0-100) */
  reputationScore: number;

  /** Chain ID (84532 = Base Sepolia, 31337 = Local) */
  chainId: number;

  /** Contract addresses */
  contracts: {
    identityRegistry: string;
    reputationSystem: string;
  };
}

/**
 * Agent0 SDK registration data
 * @see Agent0 TypeScript SDK
 */
export interface Agent0Registration {
  /** Agent0 token ID from registry */
  tokenId: string;

  /** IPFS CID for metadata */
  metadataCID: string;

  /** Subgraph-indexed agent data */
  subgraphData?: {
    owner: string;
    metadataURI: string;
    timestamp: number;
  };

  /** Discovery endpoint */
  discoveryEndpoint: string;
}

/**
 * Unified agent registration record
 * Single source of truth for all agent types
 */
export interface UnifiedAgentRegistration {
  /** Unique agent identifier (userId for USER_CONTROLLED, actorId for NPC, externalId for EXTERNAL) */
  agentId: string;

  /** Agent type classification */
  type: AgentType;

  /** Current lifecycle status */
  status: AgentStatus;

  /** Trust and verification level */
  trustLevel: TrustLevel;

  /** Reference to User record (null for EXTERNAL before link) */
  userId: string | null;

  /** Display name */
  name: string;

  /** Agent system prompt/personality */
  systemPrompt: string;

  /** Declared capabilities (A2A Protocol format) */
  capabilities: AgentCapabilities;

  /** Discovery metadata (A2A Agent Card) */
  discoveryMetadata: AgentCard | null;

  /** On-chain registration info (ERC-8004) */
  onChainData: OnChainRegistration | null;

  /** Agent0 SDK registration info */
  agent0Data: Agent0Registration | null;

  /** Active runtime instance reference */
  runtimeInstanceId: string | null;

  /** Timestamps */
  registeredAt: Date;
  lastActiveAt: Date | null;
  terminatedAt: Date | null;
}

/**
 * Agent discovery filter for querying
 */
export interface AgentDiscoveryFilter {
  /** Filter by agent types */
  types?: AgentType[];

  /** Filter by status */
  statuses?: AgentStatus[];

  /** Minimum trust level */
  minTrustLevel?: TrustLevel;

  /** Required capabilities */
  requiredCapabilities?: string[];

  /** Search by name/description */
  search?: string;

  /** Filter by OASF skills (Agent0 SDK v0.31.0) */
  requiredSkills?: string[];

  /** Filter by OASF domains (Agent0 SDK v0.31.0) */
  requiredDomains?: string[];

  /** Match mode for skills/domains: 'any' (OR) or 'all' (AND) */
  matchMode?: 'any' | 'all';

  /** Pagination */
  limit?: number;
  offset?: number;
}

/**
 * Runtime creation options
 */
export interface RuntimeCreationOptions {
  /** Agent registry entry */
  registration: UnifiedAgentRegistration;

  /** Override model selection */
  modelOverride?: string;

  /** Additional plugins beyond defaults */
  additionalPlugins?: unknown[];

  /** Skip automatic enhancement */
  skipEnhancement?: boolean;
}

/**
 * External agent connection parameters
 */
export interface ExternalAgentConnectionParams {
  /** External agent identifier */
  externalId: string;

  /** Agent name */
  name: string;

  /** Agent description/system prompt */
  description: string;

  /** Communication endpoint (A2A or MCP) */
  endpoint: string;

  /** Protocol type */
  protocol: 'a2a' | 'mcp' | 'agent0' | 'custom';

  /** Declared capabilities */
  capabilities: AgentCapabilities;

  /** Authentication credentials */
  authentication?: {
    type: 'wallet' | 'apiKey' | 'oauth';
    credentials: string;
  };

  /** Agent Card metadata */
  agentCard?: AgentCard;
}
