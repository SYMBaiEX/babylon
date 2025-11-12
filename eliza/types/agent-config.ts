/**
 * Agent Configuration Types
 * 
 * TypeScript interfaces for agent identity, session, and configuration
 */

export interface AgentConfig {
  characterId: string
  characterFile: string
  derivationIndex: number
  strategies: string[]
  riskTolerance: number
  tradingLimits: {
    maxTradeSize: number
    maxPositionSize: number
    minConfidence: number
  }
  envOverrides?: Record<string, string>
}

export interface AgentIdentity {
  agentId: string
  tokenId: number
  walletAddress: string
  privateKey: string
  metadataCID?: string
  registrationTxHash?: string
  registeredAt: number
}

export interface AgentSession {
  agentId: string
  sessionToken: string
  expiresAt: number
  createdAt: number
}

export interface AgentOnboardingResult {
  agentId: string
  tokenId: number
  walletAddress: string
  sessionToken: string
  txHash: string
  metadataCID?: string
}

export interface BabylonEndpoints {
  api: string
  a2a: string
  mcp: string
}

export interface DiscoveredBabylon {
  name: string
  tokenId: number
  endpoints: BabylonEndpoints
  capabilities: {
    strategies: string[]
    markets: string[]
    actions: string[]
  }
  reputation?: {
    trustScore: number
    accuracyScore: number
  }
}

export interface AgentManifest {
  id: string
  characterFile: string
  derivationIndex: number
  strategies: string[]
  riskTolerance: number
  autoTrade: boolean
  maxTradeSize: number
  maxPositionSize: number
  minConfidence: number
}

export type ManifestList = AgentManifest[]


