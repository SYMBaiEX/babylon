/**
 * A2A Authentication Utilities
 * 
 * Functions for building and verifying A2A authentication messages
 */

import { verifyMessage } from 'ethers'

/**
 * Agent lookup function type for verifying agent registration
 */
export type AgentLookupFunction = (agentId: string) => Promise<{ address: string } | null>

/**
 * Build A2A authentication message for signature
 * Format: "A2A Authentication\n\nAgent: {agentId}\nAddress: {address}\nToken: {tokenId}\nTimestamp: {timestamp}"
 */
export function buildA2AAuthMessage(
  agentId: string,
  address: string,
  tokenId: number,
  timestamp: number
): string {
  return `A2A Authentication\n\nAgent: ${agentId}\nAddress: ${address}\nToken: ${tokenId}\nTimestamp: ${timestamp}`
}

/**
 * Verify agent signature against authentication message
 * 
 * Verifies:
 * 1. The signature is valid for the message
 * 2. The recovered address matches the expected address (if provided)
 * 3. The agentId corresponds to a registered agent with matching address (if lookup function provided)
 * 
 * @param agentId - Agent identifier to verify
 * @param signature - Signature hex string
 * @param message - Authentication message to verify
 * @param expectedAddress - Expected address from the authentication request
 * @param agentLookup - Optional function to lookup agent by ID and verify registration
 * @returns true if signature is valid and agent verification passes
 */
export async function verifyAgentSignature(
  agentId: string,
  signature: string,
  message: string,
  expectedAddress?: string,
  agentLookup?: AgentLookupFunction
): Promise<boolean> {
  try {
    // Step 1: Verify the signature is valid and recover the address
    const recoveredAddress = verifyMessage(message, signature)
    if (!recoveredAddress || recoveredAddress.length === 0) {
      return false
    }
    
    // Step 2: If expected address is provided, verify it matches the recovered address
    if (expectedAddress) {
      const addressMatches = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase()
      if (!addressMatches) {
        return false
      }
    }
    
    // Step 3: If agent lookup function is provided, verify the agent is registered
    // and the address matches the registered agent's address
    if (agentLookup) {
      const agent = await agentLookup(agentId)
      if (!agent) {
        // Agent not found in registry
        return false
      }
      
      // Verify the recovered address matches the registered agent's address
      const registeredAddressMatches = recoveredAddress.toLowerCase() === agent.address.toLowerCase()
      if (!registeredAddressMatches) {
        return false
      }
    }
    
    // All verifications passed
    return true
  } catch (error) {
    return false
  }
}

