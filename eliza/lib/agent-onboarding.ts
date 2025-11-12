/**
 * Agent Onboarding Orchestration
 * 
 * Coordinates complete agent onboarding flow:
 * 1. Generate wallet
 * 2. Create session
 * 3. Register on-chain via /api/agents/onboard
 * 4. Return complete identity
 */

import type { HDNodeWallet } from 'ethers'
import type { AgentOnboardingResult, DiscoveredBabylon } from '../types/agent-config'
import { generateAgentWallet } from './agent-wallet'
import { getOrCreateSession } from './agent-session'
import { createAgentIdentity } from './agent-identity'

export interface OnboardAgentParams {
  agentId: string
  characterName: string
  masterMnemonic: string
  derivationIndex: number
  agentSecret: string
  babylon: DiscoveredBabylon
}

/**
 * Complete agent onboarding flow
 */
export async function onboardAgent(params: OnboardAgentParams): Promise<AgentOnboardingResult> {
  const { agentId, characterName, masterMnemonic, derivationIndex, agentSecret, babylon } = params
  
  const wallet: HDNodeWallet = generateAgentWallet(agentId, masterMnemonic, derivationIndex)
  
  const sessionToken = await getOrCreateSession(agentId, agentSecret, babylon.endpoints.api)
  
  const result = await createAgentIdentity(
    agentId,
    characterName,
    wallet,
    sessionToken,
    babylon.endpoints.api
  )
  
  return result
}


