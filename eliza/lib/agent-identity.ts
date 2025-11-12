/**
 * Agent Identity Manager
 * 
 * Manages ERC-8004 on-chain identities for agents
 * Integrates with Babylon onboarding API
 */

import type { AgentIdentity, AgentOnboardingResult } from '../types/agent-config'
import type { HDNodeWallet } from 'ethers'

const identities = new Map<string, AgentIdentity>()

interface OnboardResponse {
  tokenId: number
  agentId: string
  txHash: string
  agent0MetadataCID?: string
}

interface OnboardStatusResponse {
  isRegistered: boolean
  tokenId: number | null
  txHash: string | null
  agentId: string
  reputationAwarded: boolean
}

/**
 * Create agent identity through Babylon onboarding API
 */
export async function createAgentIdentity(
  agentId: string,
  characterName: string,
  wallet: HDNodeWallet,
  sessionToken: string,
  apiBaseUrl: string
): Promise<AgentOnboardingResult> {
  const response = await fetch(`${apiBaseUrl}/api/agents/onboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      agentName: characterName,
      endpoint: `${apiBaseUrl}/agent/${agentId}`,
    }),
  })
  
  const data = await response.json() as OnboardResponse
  
  const identity: AgentIdentity = {
    agentId,
    tokenId: data.tokenId,
    walletAddress: wallet.address,
    privateKey: wallet.privateKey,
    metadataCID: data.agent0MetadataCID,
    registrationTxHash: data.txHash,
    registeredAt: Date.now(),
  }
  
  identities.set(agentId, identity)
  
  return {
    agentId,
    tokenId: data.tokenId,
    walletAddress: wallet.address,
    sessionToken,
    txHash: data.txHash,
    metadataCID: data.agent0MetadataCID,
  }
}

/**
 * Get existing agent identity
 */
export function getAgentIdentity(agentId: string): AgentIdentity | null {
  return identities.get(agentId) || null
}

/**
 * Check if agent is already registered on-chain
 */
export async function checkRegistrationStatus(
  sessionToken: string,
  apiBaseUrl: string
): Promise<OnboardStatusResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agents/onboard`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  })
  
  return await response.json() as OnboardStatusResponse
}

/**
 * Store existing identity in memory
 */
export function storeAgentIdentity(identity: AgentIdentity): void {
  identities.set(identity.agentId, identity)
}

/**
 * Verify agent owns the token ID
 */
export function verifyAgentIdentity(agentId: string, expectedTokenId: number): boolean {
  const identity = identities.get(agentId)
  return identity?.tokenId === expectedTokenId
}


