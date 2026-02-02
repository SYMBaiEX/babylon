import { WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useCallback } from 'react';
import { updateAgentProfileOnchainAction } from '@/app/_actions/onchain';
import { useAuth } from '@/hooks/useAuth';

/**
 * Metadata for updating an agent profile on-chain.
 */
export interface AgentProfileMetadata {
  /** Display name */
  name: string;
  /** Username (optional) */
  username?: string | null;
  /** Bio/description (optional) */
  bio?: string | null;
  /** Profile image URL (optional) */
  profileImageUrl?: string | null;
  /** Cover image URL (optional) */
  coverImageUrl?: string | null;
  /** Agent type (default: 'user') */
  type?: 'user' | string;
  /** ISO timestamp of update */
  updated?: string;
}

interface UpdateAgentProfileInput {
  metadata: AgentProfileMetadata;
  endpoint?: string;
}

/**
 * Hook for updating an agent profile on-chain.
 *
 * Uses a server-side sponsored transaction flow (Privy embedded wallet + server actions).
 */
export function useUpdateAgentProfileTx() {
  const { embeddedWalletReady, embeddedWalletAddress, getAccessToken } = useAuth();

  const updateAgentProfile = useCallback(
    async ({ metadata, endpoint }: UpdateAgentProfileInput) => {
      if (!embeddedWalletReady || !embeddedWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }

      const userJwt = await getAccessToken().catch(() => null);
      if (!userJwt) {
        throw new Error('Authentication required');
      }

      const { txHash } = await updateAgentProfileOnchainAction({
        metadata,
        endpoint,
        userJwt,
      });
      return txHash;
    },
    [embeddedWalletReady, embeddedWalletAddress, getAccessToken]
  );

  return {
    updateAgentProfile,
    embeddedWalletAddress,
    embeddedWalletReady,
  };
}
