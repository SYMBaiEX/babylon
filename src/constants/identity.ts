/**
 * Identity Registry Configuration
 * 
 * @module constants/identity
 * 
 * @description
 * Provides constants and utilities for interacting with the ERC-8004 compliant
 * identity registry contract on-chain. The identity registry manages agent
 * identities, capabilities, and on-chain reputation in the Babylon ecosystem.
 * 
 * **Key Functions:**
 * - Agent registration and capability management
 * - On-chain identity verification
 * - Reputation tracking and queries
 * - Capability hash standardization
 * 
 * @example
 * ```typescript
 * import { getIdentityRegistryAddress, CAPABILITIES_HASH } from '@/constants/identity'
 * 
 * const registryAddress = getIdentityRegistryAddress()
 * // Use with viem to interact with identity registry
 * ```
 * 
 * @see {@link https://eips.ethereum.org/EIPS/eip-8004} ERC-8004 Specification
 */

import type { Address } from 'viem';
import { parseAbi, zeroAddress } from 'viem';

import { CHAIN_ID } from '@/constants/chains';
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis';
import { getContractAddresses } from '@/lib/web3/contracts';

/**
 * Capabilities hash constant for identity registry
 * 
 * @constant CAPABILITIES_HASH
 * @type {string}
 * 
 * @description
 * Standard hash used to identify and store agent capabilities in the ERC-8004
 * identity registry. This hash acts as a key for capability metadata storage
 * on-chain, enabling efficient capability queries and verification.
 * 
 * @remarks
 * - Value: `0x0000000000000000000000000000000000000000000000000000000000000001`
 * - Used as a storage slot identifier in the registry contract
 * - Part of the ERC-8004 capability management system
 */
export const CAPABILITIES_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

/**
 * Parsed ABI for the identity registry contract
 * 
 * @constant identityRegistryAbi
 * @type {Abi}
 * 
 * @description
 * Viem-parsed ABI for the ERC-8004 identity registry contract.
 * Used for type-safe contract interaction, encoding function calls,
 * and decoding event logs.
 * 
 * @example
 * ```typescript
 * import { identityRegistryAbi } from '@/constants/identity'
 * import { readContract } from 'viem'
 * 
 * const tokenId = await readContract({
 *   address: registryAddress,
 *   abi: identityRegistryAbi,
 *   functionName: 'getTokenId',
 *   args: [agentAddress]
 * })
 * ```
 */
export const identityRegistryAbi = parseAbi(IDENTITY_REGISTRY_ABI);

/**
 * Gets the identity registry contract address for the current chain
 * 
 * @returns The contract address for the identity registry
 * @throws {Error} If the identity registry is not configured for the current chain
 * 
 * @description
 * Retrieves the deployed ERC-8004 identity registry contract address for the
 * currently configured blockchain. Address varies by network (Base, Sepolia, etc).
 * 
 * @example
 * ```typescript
 * const address = getIdentityRegistryAddress();
 * // Returns: "0x..." (contract address)
 * 
 * // Use with viem
 * const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) })
 * const data = await client.readContract({
 *   address: getIdentityRegistryAddress(),
 *   abi: identityRegistryAbi,
 *   functionName: 'getAgentReputation',
 *   args: [tokenId]
 * })
 * ```
 * 
 * @remarks
 * - Address is chain-specific and set via environment configuration
 * - Throws error if registry not deployed on current chain
 * - Used throughout the application for on-chain identity operations
 */
export function getIdentityRegistryAddress(): Address {
  const { identityRegistry } = getContractAddresses(CHAIN_ID);

  if (!identityRegistry || identityRegistry === zeroAddress) {
    throw new Error(
      'Identity registry contract address is not configured for this chain.'
    );
  }

  return identityRegistry;
}
