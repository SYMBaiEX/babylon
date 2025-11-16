/**
 * Identity Registry Configuration
 * 
 * Provides constants and utilities for interacting with the ERC-8004
 * identity registry contract on-chain.
 */

import type { Address } from 'viem';
import { parseAbi, zeroAddress } from 'viem';

import { CHAIN_ID } from '@/constants/chains';
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis';
import { getContractAddresses } from '@/lib/web3/contracts';

/**
 * Capabilities hash constant for identity registry.
 * Used to identify agent capabilities in the registry.
 */
export const CAPABILITIES_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

/**
 * Parsed ABI for the identity registry contract.
 * Used for encoding/decoding contract calls.
 */
export const identityRegistryAbi = parseAbi(IDENTITY_REGISTRY_ABI);

/**
 * Gets the identity registry contract address for the current chain.
 * 
 * @returns The contract address for the identity registry
 * @throws Error if the identity registry is not configured for the current chain
 * 
 * @example
 * ```typescript
 * const address = getIdentityRegistryAddress();
 * // Returns: "0x..." (contract address)
 * ```
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
