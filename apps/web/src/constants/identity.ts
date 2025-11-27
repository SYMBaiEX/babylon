import type { Address } from 'viem';
import { parseAbi, zeroAddress } from 'viem';

import { CHAIN_ID } from '@/constants/chains';
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis';
import { getContractAddresses } from '@/lib/web3/contracts';

export const CAPABILITIES_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export const identityRegistryAbi = parseAbi(IDENTITY_REGISTRY_ABI);

export function getIdentityRegistryAddress(): Address | null {
  const { identityRegistry } = getContractAddresses(CHAIN_ID);

  if (!identityRegistry || identityRegistry === zeroAddress) {
    // Return null instead of throwing to allow graceful degradation in test/dev environments
    return null;
  }

  return identityRegistry;
}
