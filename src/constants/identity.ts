import type { Address } from 'viem';
import { parseAbi, zeroAddress } from 'viem';

import { CHAIN_ID } from '@/constants/chains';
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis';
import { getContractAddresses } from '@/lib/web3/contracts';

export const CAPABILITIES_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export const identityRegistryAbi = parseAbi(IDENTITY_REGISTRY_ABI);

export function getIdentityRegistryAddress(): Address {
  const { identityRegistry } = getContractAddresses(CHAIN_ID);

  if (!identityRegistry || identityRegistry === zeroAddress) {
    throw new Error(
      'Identity registry contract address is not configured for this chain.'
    );
  }

  return identityRegistry;
}
