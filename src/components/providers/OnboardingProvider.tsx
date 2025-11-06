'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore, type User as StoreUser } from '@/stores/authStore'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { apiFetch } from '@/lib/api/fetch'
import { logger } from '@/lib/logger'
import { clearReferralCode, getReferralCode } from './ReferralCaptureProvider'
import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type EIP1193Provider,
  type ExactPartial,
  type RpcTransactionRequest,
} from 'viem'
import { baseSepolia } from 'viem/chains'
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis'
import type { OnboardingProfilePayload } from '@/lib/onboarding/types'
import { useIdentityToken } from '@privy-io/react-auth'

type OnboardingStage = 'PROFILE' | 'ONCHAIN' | 'COMPLETED'

const CAPABILITIES_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as const
const identityRegistryAbi = parseAbi(IDENTITY_REGISTRY_ABI)
const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const maybe = error as { message?: unknown }
    if (typeof maybe.message === 'string') {
      return maybe.message
    }
  }
  return 'Unknown error'
}

async function requestClientRegistrationTx(
  walletProvider: EIP1193Provider,
  walletAddress: string,
  profile: OnboardingProfilePayload
): Promise<string> {
  const registryAddress = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA
  if (!registryAddress) {
    throw new Error('Identity registry contract address is not configured.')
  }

  const agentEndpoint = `https://babylon.game/agent/${walletAddress.toLowerCase()}`
  const metadataUri = JSON.stringify({
    name: profile.displayName ?? profile.username,
    bio: profile.bio ?? '',
    type: 'user',
    registered: new Date().toISOString(),
  })

  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: 'registerAgent',
    args: [profile.username, agentEndpoint, CAPABILITIES_HASH, metadataUri],
  })

  const txRequest: ExactPartial<RpcTransactionRequest> = {
    from: walletAddress as Address,
    to: registryAddress as Address,
    data,
    value: '0x0',
  }

  const txHash = await walletProvider.request({
    method: 'eth_sendTransaction',
    params: [txRequest] as any,
  })

  if (typeof txHash !== 'string') {
    throw new Error('Unexpected response from wallet while sending transaction.')
  }

  return txHash
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user, wallet, needsOnboarding, needsOnchain, loadingProfile, refresh } = useAuth()
  const { setUser, setNeedsOnboarding, setNeedsOnchain } = useAuthStore()
  const { identityToken } = useIdentityToken()

  const [stage, setStage] = useState<OnboardingStage>('PROFILE')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedProfile, setSubmittedProfile] = useState<OnboardingProfilePayload | null>(null)

  const shouldShowModal = useMemo(() => {
    if (!authenticated || loadingProfile) {
      return false
    }

    return Boolean(needsOnboarding || needsOnchain || stage === 'ONCHAIN' || stage === 'COMPLETED')
  }, [authenticated, loadingProfile, needsOnboarding, needsOnchain, stage])

  useEffect(() => {
    if (!authenticated) {
      setStage('PROFILE')
      setSubmittedProfile(null)
      setError(null)
      return
    }

    if (loadingProfile) {
      return
    }

    if (needsOnboarding) {
      setStage('PROFILE')
      return
    }

    if (needsOnchain) {
      if (!submittedProfile && user) {
        setSubmittedProfile({
          username: user.username ?? `user_${user.id.slice(0, 8)}`,
          displayName: user.displayName ?? user.username ?? 'New User',
          bio: user.bio ?? undefined,
          profileImageUrl: user.profileImageUrl ?? undefined,
          coverImageUrl: user.coverImageUrl ?? undefined,
        })
      }
      setStage((prev) => (prev === 'COMPLETED' ? prev : 'ONCHAIN'))
      return
    }

    if (stage !== 'COMPLETED') {
      setStage('PROFILE')
      setSubmittedProfile(null)
      setError(null)
    }
  }, [authenticated, loadingProfile, needsOnboarding, needsOnchain, user, submittedProfile, stage])

  const submitOnchain = useCallback(
    async (profile: OnboardingProfilePayload, referralCode: string | null) => {
      const body = {
        walletAddress: wallet?.address ?? null,
        referralCode: referralCode ?? undefined,
      }

      const callEndpoint = async (payload: Record<string, unknown>) => {
        const response = await apiFetch('/api/users/onboarding/onchain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const rawError = data?.error
          const message =
            (typeof rawError === 'string'
              ? rawError
              : typeof rawError?.message === 'string'
              ? rawError.message
              : null) ?? `Failed to complete on-chain onboarding (status ${response.status})`
          const error = new Error(message)
          throw error
        }
        return data as { onchain: unknown; user: StoreUser | null }
      }

      const applyResponse = (data: { onchain: unknown; user: StoreUser | null }) => {
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
            reputationPoints: data.user.reputationPoints ?? user?.reputationPoints,
            hasFarcaster: data.user.hasFarcaster ?? user?.hasFarcaster,
            hasTwitter: data.user.hasTwitter ?? user?.hasTwitter,
            farcasterUsername: data.user.farcasterUsername ?? user?.farcasterUsername,
            twitterUsername: data.user.twitterUsername ?? user?.twitterUsername,
            nftTokenId: data.user.nftTokenId ?? undefined,
            createdAt: data.user.createdAt ?? user?.createdAt,
            onChainRegistered: data.user.onChainRegistered ?? user?.onChainRegistered,
          })
        }
        setNeedsOnboarding(false)
        setNeedsOnchain(false)
        setStage('COMPLETED')
        void refresh().catch(() => undefined)
      }

      const completeWithClient = async () => {
        if (!wallet?.address) {
          throw new Error('Wallet connection required to complete on-chain registration.')
        }

        logger.info(
          'Attempting client-signed on-chain registration',
          { address: wallet.address },
          'OnboardingProvider'
        )

        const provider = (await wallet.getEthereumProvider()) as EIP1193Provider
        if (wallet.chainId !== `eip155:${BASE_SEPOLIA_CHAIN_ID}`) {
          await wallet.switchChain(BASE_SEPOLIA_CHAIN_ID)
        }

        await provider.request({ method: 'eth_requestAccounts' })
        const txHash = await requestClientRegistrationTx(provider, wallet.address, profile)

        logger.info(
          'Client-submitted on-chain registration transaction',
          { txHash },
          'OnboardingProvider'
        )

        const data = await callEndpoint({
          ...body,
          txHash,
        })
        return data
      }

      const completeWithServer = async () => {
        logger.info('Attempting server-signed on-chain registration', undefined, 'OnboardingProvider')
        return callEndpoint(body)
      }

      try {
        let response: { onchain: unknown; user: StoreUser | null }

        if (wallet?.address && !user?.isActor) {
          try {
            response = await completeWithClient()
          } catch (clientError) {
            const message = extractErrorMessage(clientError).toLowerCase()
            if (message.includes('user rejected')) {
              throw new Error('Transaction cancelled in wallet. Please approve to continue.')
            }
            if (message.includes('insufficient funds')) {
              throw new Error('Insufficient funds to pay gas on Base Sepolia.')
            }
            logger.warn(
              'Client-signed registration attempt failed; falling back to server signer',
              { error: clientError },
              'OnboardingProvider'
            )
            response = await completeWithServer()
          }
        } else {
          response = await completeWithServer()
        }

        applyResponse(response)
      } catch (rawError) {
        const message = extractErrorMessage(rawError)

        if (
          (message.includes('SERVER_SIGNER_UNSUPPORTED') ||
            message.includes('Server wallet not configured')) &&
          wallet?.address &&
          !user?.isActor
        ) {
          try {
            const clientResponse = await completeWithClient()
            applyResponse(clientResponse)
            return
          } catch (clientFallbackError) {
            const fallbackMessage = extractErrorMessage(clientFallbackError)
            setError(fallbackMessage)
            logger.error(
              'Client fallback failed after server signer unsupported',
              { error: clientFallbackError },
              'OnboardingProvider'
            )
            return
          }
        }

        setError(message)
        logger.error('Failed to complete on-chain onboarding', { error: rawError }, 'OnboardingProvider')
      }
    },
    [wallet, refresh, setNeedsOnboarding, setNeedsOnchain, setUser, user]
  )

  const handleProfileSubmit = useCallback(
    async (payload: OnboardingProfilePayload) => {
      setIsSubmitting(true)
      setError(null)

      try {
        const referralCode = getReferralCode()

        logger.info(
          'Identity token state during signup',
          { present: Boolean(identityToken), tokenPreview: identityToken ? `${identityToken.slice(0, 12)}...` : null },
          'OnboardingProvider'
        )

        const response = await apiFetch('/api/users/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            referralCode: referralCode ?? undefined,
            identityToken: identityToken ?? undefined,
          }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = data?.error || `Failed to complete signup (status ${response.status})`
          throw new Error(message)
        }

        if (data.user) {
          setUser({
            id: data.user.id,
            walletAddress: data.user.walletAddress ?? wallet?.address,
            displayName: data.user.displayName ?? payload.displayName,
            email: user?.email,
            username: data.user.username ?? payload.username,
            bio: data.user.bio ?? payload.bio,
            profileImageUrl: data.user.profileImageUrl ?? payload.profileImageUrl ?? undefined,
            coverImageUrl: data.user.coverImageUrl ?? payload.coverImageUrl ?? undefined,
            profileComplete: data.user.profileComplete ?? true,
            reputationPoints: data.user.reputationPoints ?? user?.reputationPoints,
            hasFarcaster: data.user.hasFarcaster ?? user?.hasFarcaster,
            hasTwitter: data.user.hasTwitter ?? user?.hasTwitter,
            farcasterUsername: data.user.farcasterUsername ?? user?.farcasterUsername,
            twitterUsername: data.user.twitterUsername ?? user?.twitterUsername,
            nftTokenId: data.user.nftTokenId ?? undefined,
            createdAt: data.user.createdAt ?? user?.createdAt,
            onChainRegistered: data.user.onChainRegistered ?? user?.onChainRegistered,
          })
        }
        setNeedsOnboarding(false)
        setNeedsOnchain(true)

        clearReferralCode()
        setSubmittedProfile(payload)
        setStage('ONCHAIN')

        await submitOnchain(payload, referralCode)
      } catch (rawError) {
        const message = extractErrorMessage(rawError)
        setError(message)
        logger.error('Failed to complete profile onboarding', { error: rawError }, 'OnboardingProvider')
      } finally {
        setIsSubmitting(false)
      }
    },
    [submitOnchain, user, wallet, setUser, setNeedsOnboarding, setNeedsOnchain, identityToken]
  )

  const handleRetryOnchain = useCallback(async () => {
    if (!submittedProfile) return
    setIsSubmitting(true)
    setError(null)

    try {
      await submitOnchain(submittedProfile, getReferralCode())
    } catch (rawError) {
      const message = extractErrorMessage(rawError)
      setError(message)
      logger.error('Failed to retry on-chain onboarding', { error: rawError }, 'OnboardingProvider')
    } finally {
      setIsSubmitting(false)
    }
  }, [submittedProfile, submitOnchain])

  const handleClose = useCallback(() => {
    if (needsOnboarding || needsOnchain) return
    setStage('PROFILE')
    setSubmittedProfile(null)
    setError(null)
  }, [needsOnboarding, needsOnchain])

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
  )
}
