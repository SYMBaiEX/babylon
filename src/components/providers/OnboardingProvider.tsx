'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type ConnectedWallet,
  useIdentityToken,
  useSendTransaction,
} from '@privy-io/react-auth';
import { type Address, encodeFunctionData, parseAbi } from 'viem';

import { OnboardingModal } from '@/components/onboarding/OnboardingModal';

import { apiFetch } from '@/lib/api/fetch';
import { logger } from '@/lib/logger';
import type { OnboardingProfilePayload } from '@/lib/onboarding/types';
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis';

import { useAuth } from '@/hooks/useAuth';

import { CHAIN_ID } from '@/constants/chains';
import { type User as StoreUser, useAuthStore } from '@/stores/authStore';

import { clearReferralCode, getReferralCode } from './ReferralCaptureProvider';

type OnboardingStage = 'PROFILE' | 'ONCHAIN' | 'COMPLETED';

const CAPABILITIES_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as const;
const identityRegistryAbi = parseAbi(IDENTITY_REGISTRY_ABI);
const isEmbeddedPrivyWallet = (candidate?: ConnectedWallet | null) =>
  candidate?.walletClientType === 'privy' ||
  candidate?.walletClientType === 'privy-v2';

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === 'string') {
      return maybe.message;
    }
  }
  return 'Unknown error';
}

async function requestClientRegistrationTx(
  walletAddress: string,
  profile: OnboardingProfilePayload,
  sendTransaction: ReturnType<typeof useSendTransaction>['sendTransaction']
): Promise<string> {
  const registryAddress =
    process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA;
  if (!registryAddress) {
    throw new Error('Identity registry contract address is not configured.');
  }

  const agentEndpoint = `https://babylon.game/agent/${walletAddress.toLowerCase()}`;
  const metadataUri = JSON.stringify({
    name: profile.displayName ?? profile.username,
    bio: profile.bio ?? '',
    type: 'user',
    registered: new Date().toISOString(),
  });

  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: 'registerAgent',
    args: [profile.username, agentEndpoint, CAPABILITIES_HASH, metadataUri],
  });

  const txRequest = {
    to: registryAddress as Address,
    data,
    value: '0x0' as `0x${string}`,
    chainId: CHAIN_ID,
  };

  const { hash } = await sendTransaction(txRequest, {
    sponsor: true,
    address: walletAddress as `0x${string}`,
  });

  return hash;
}

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    authenticated,
    user,
    wallet,
    needsOnboarding,
    needsOnchain,
    loadingProfile,
    refresh,
  } = useAuth();
  const { setUser, setNeedsOnboarding, setNeedsOnchain } = useAuthStore();
  const { identityToken } = useIdentityToken();
  const { sendTransaction: privySendTransaction } = useSendTransaction();
  const embeddedWallet = useMemo(
    () => (wallet && isEmbeddedPrivyWallet(wallet) ? wallet : null),
    [wallet]
  );

  const [stage, setStage] = useState<OnboardingStage>('PROFILE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedProfile, setSubmittedProfile] =
    useState<OnboardingProfilePayload | null>(null);

  const shouldShowModal = useMemo(() => {
    if (!authenticated || loadingProfile) {
      return false;
    }

    return Boolean(
      needsOnboarding ||
        needsOnchain ||
        stage === 'ONCHAIN' ||
        stage === 'COMPLETED'
    );
  }, [authenticated, loadingProfile, needsOnboarding, needsOnchain, stage]);

  useEffect(() => {
    if (!authenticated) {
      setStage('PROFILE');
      setSubmittedProfile(null);
      setError(null);
      return;
    }

    if (loadingProfile) {
      return;
    }

    if (needsOnboarding) {
      setStage('PROFILE');
      return;
    }

    if (needsOnchain) {
      if (!submittedProfile && user) {
        setSubmittedProfile({
          username: user.username ?? `user_${user.id.slice(0, 8)}`,
          displayName: user.displayName ?? user.username ?? 'New User',
          bio: user.bio ?? undefined,
          profileImageUrl: user.profileImageUrl ?? undefined,
          coverImageUrl: user.coverImageUrl ?? undefined,
        });
      }
      setStage((prev) => (prev === 'COMPLETED' ? prev : 'ONCHAIN'));
      return;
    }

    if (stage !== 'COMPLETED') {
      setStage('PROFILE');
      setSubmittedProfile(null);
      setError(null);
    }
  }, [
    authenticated,
    loadingProfile,
    needsOnboarding,
    needsOnchain,
    user,
    submittedProfile,
    stage,
  ]);

  const submitOnchain = useCallback(
    async (profile: OnboardingProfilePayload, referralCode: string | null) => {
      const body = {
        walletAddress: embeddedWallet?.address ?? wallet?.address ?? null,
        referralCode: referralCode ?? undefined,
      };

      const callEndpoint = async (payload: Record<string, unknown>) => {
        const response = await apiFetch('/api/users/onboarding/onchain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const rawError = data?.error;
          const message =
            (typeof rawError === 'string'
              ? rawError
              : typeof rawError?.message === 'string'
                ? rawError.message
                : null) ??
            `Failed to complete on-chain onboarding (status ${response.status})`;
          const error = new Error(message);
          throw error;
        }
        return data as { onchain: unknown; user: StoreUser | null };
      };

      const applyResponse = (data: {
        onchain: unknown;
        user: StoreUser | null;
      }) => {
        if (data.user) {
          setUser({
            id: data.user.id,
            walletAddress: data.user.walletAddress ?? undefined,
            displayName: data.user.displayName ?? user?.displayName,
            email: user?.email,
            username: data.user.username ?? undefined,
            bio: data.user.bio ?? undefined,
            profileImageUrl: data.user.profileImageUrl ?? undefined,
            coverImageUrl: data.user.coverImageUrl ?? undefined,
            profileComplete: data.user.profileComplete ?? true,
            reputationPoints:
              data.user.reputationPoints ?? user?.reputationPoints,
            hasFarcaster: data.user.hasFarcaster ?? user?.hasFarcaster,
            hasTwitter: data.user.hasTwitter ?? user?.hasTwitter,
            farcasterUsername:
              data.user.farcasterUsername ?? user?.farcasterUsername,
            twitterUsername: data.user.twitterUsername ?? user?.twitterUsername,
            nftTokenId: data.user.nftTokenId ?? undefined,
            createdAt: data.user.createdAt ?? user?.createdAt,
            onChainRegistered:
              data.user.onChainRegistered ?? user?.onChainRegistered,
          });
        }
        setNeedsOnboarding(false);
        setNeedsOnchain(false);
        setStage('COMPLETED');
        void refresh().catch(() => undefined);
      };

      const completeWithClient = async () => {
        if (!embeddedWallet?.address) {
          throw new Error(
            'Gasless registration requires your Babylon embedded wallet.'
          );
        }

        logger.info(
          'Attempting client-signed on-chain registration',
          { address: embeddedWallet.address },
          'OnboardingProvider'
        );

        const txHash = await requestClientRegistrationTx(
          embeddedWallet.address,
          profile,
          privySendTransaction
        );

        logger.info(
          'Client-submitted on-chain registration transaction',
          { txHash },
          'OnboardingProvider'
        );

        const data = await callEndpoint({
          ...body,
          txHash,
        });
        return data;
      };

      try {
        const response = await completeWithClient();

        applyResponse(response);
      } catch (rawError) {
        const message = extractErrorMessage(rawError);

        if (
          (message.includes('SERVER_SIGNER_UNSUPPORTED') ||
            message.includes('Server wallet not configured')) &&
          embeddedWallet?.address &&
          !user?.isActor
        ) {
          try {
            const clientResponse = await completeWithClient();
            applyResponse(clientResponse);
            return;
          } catch (clientFallbackError) {
            const fallbackMessage = extractErrorMessage(clientFallbackError);
            setError(fallbackMessage);
            logger.error(
              'Client fallback failed after server signer unsupported',
              { error: clientFallbackError },
              'OnboardingProvider'
            );
            return;
          }
        }

        setError(message);
        logger.error(
          'Failed to complete on-chain onboarding',
          { error: rawError },
          'OnboardingProvider'
        );
      }
    },
    [
      embeddedWallet,
      refresh,
      setNeedsOnboarding,
      setNeedsOnchain,
      setUser,
      user,
      wallet,
    ]
  );

  const handleProfileSubmit = useCallback(
    async (payload: OnboardingProfilePayload) => {
      setIsSubmitting(true);
      setError(null);

      try {
        const referralCode = getReferralCode();

        logger.info(
          'Identity token state during signup',
          {
            present: Boolean(identityToken),
            tokenPreview: identityToken
              ? `${identityToken.slice(0, 12)}...`
              : null,
          },
          'OnboardingProvider'
        );

        const response = await apiFetch('/api/users/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            referralCode: referralCode ?? undefined,
            identityToken: identityToken ?? undefined,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            data?.error ||
            `Failed to complete signup (status ${response.status})`;
          throw new Error(message);
        }

        if (data.user) {
          setUser({
            id: data.user.id,
            walletAddress: data.user.walletAddress ?? wallet?.address,
            displayName: data.user.displayName ?? payload.displayName,
            email: user?.email,
            username: data.user.username ?? payload.username,
            bio: data.user.bio ?? payload.bio,
            profileImageUrl:
              data.user.profileImageUrl ?? payload.profileImageUrl ?? undefined,
            coverImageUrl:
              data.user.coverImageUrl ?? payload.coverImageUrl ?? undefined,
            profileComplete: data.user.profileComplete ?? true,
            reputationPoints:
              data.user.reputationPoints ?? user?.reputationPoints,
            hasFarcaster: data.user.hasFarcaster ?? user?.hasFarcaster,
            hasTwitter: data.user.hasTwitter ?? user?.hasTwitter,
            farcasterUsername:
              data.user.farcasterUsername ?? user?.farcasterUsername,
            twitterUsername: data.user.twitterUsername ?? user?.twitterUsername,
            nftTokenId: data.user.nftTokenId ?? undefined,
            createdAt: data.user.createdAt ?? user?.createdAt,
            onChainRegistered:
              data.user.onChainRegistered ?? user?.onChainRegistered,
          });
        }
        setNeedsOnboarding(false);
        setNeedsOnchain(true);

        clearReferralCode();
        setSubmittedProfile(payload);
        setStage('ONCHAIN');

        await submitOnchain(payload, referralCode);
      } catch (rawError) {
        const message = extractErrorMessage(rawError);
        setError(message);
        logger.error(
          'Failed to complete profile onboarding',
          { error: rawError },
          'OnboardingProvider'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      submitOnchain,
      user,
      wallet,
      setUser,
      setNeedsOnboarding,
      setNeedsOnchain,
      identityToken,
    ]
  );

  const handleRetryOnchain = useCallback(async () => {
    if (!submittedProfile) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await submitOnchain(submittedProfile, getReferralCode());
    } catch (rawError) {
      const message = extractErrorMessage(rawError);
      setError(message);
      logger.error(
        'Failed to retry on-chain onboarding',
        { error: rawError },
        'OnboardingProvider'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [submittedProfile, submitOnchain]);

  const handleClose = useCallback(() => {
    if (needsOnboarding || needsOnchain) return;
    setStage('PROFILE');
    setSubmittedProfile(null);
    setError(null);
  }, [needsOnboarding, needsOnchain]);

  return (
    <>
      {children}
      {shouldShowModal && (
        <OnboardingModal
          isOpen
          stage={stage}
          isSubmitting={isSubmitting}
          error={error}
          onSubmitProfile={handleProfileSubmit}
          onRetryOnchain={handleRetryOnchain}
          onClose={handleClose}
        />
      )}
    </>
  );
}
