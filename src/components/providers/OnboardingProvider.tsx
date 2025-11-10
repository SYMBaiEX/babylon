'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore, type User as StoreUser } from '@/stores/authStore'
import { OnboardingModal, type ImportedProfileData } from '@/components/onboarding/OnboardingModal'
import { apiFetch } from '@/lib/api/fetch'
import { logger } from '@/lib/logger'
import { clearReferralCode, getReferralCode } from './ReferralCaptureProvider'
import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type EIP1193Provider,
} from 'viem'
import { baseSepolia } from 'viem/chains'
import { IDENTITY_REGISTRY_ABI } from '@/lib/web3/abis'
import type { OnboardingProfilePayload } from '@/lib/onboarding/types'
import { useIdentityToken } from '@privy-io/react-auth'

type OnboardingStage = 'SOCIAL_IMPORT' | 'PROFILE' | 'ONCHAIN' | 'COMPLETED'

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

  const txRequest = {
    from: walletAddress as Address,
    to: registryAddress as Address,
    data,
    value: '0x0' as `0x${string}`,
  }

  const txHash = await walletProvider.request({
    method: 'eth_sendTransaction',
    params: [txRequest],
  } as {
    method: 'eth_sendTransaction'
    params: [typeof txRequest]
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

  const [stage, setStage] = useState<OnboardingStage>('SOCIAL_IMPORT')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedProfile, setSubmittedProfile] = useState<OnboardingProfilePayload | null>(null)
  const [userDismissed, setUserDismissed] = useState(false)
  const [importedProfileData, setImportedProfileData] = useState<ImportedProfileData | null>(null)
  const [hasProgressedPastSocialImport, setHasProgressedPastSocialImport] = useState(false)

  const shouldShowModal = useMemo(() => {
    // Check if dev mode is enabled via URL parameter
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const isDevMode = params.get('dev') === 'true'
      const isProduction = window.location.hostname === 'babylon.market'
      const isHomePage = window.location.pathname === '/'
      
      // Hide onboarding modal on production (babylon.market) on home page unless ?dev=true
      if (isProduction && isHomePage && !isDevMode) {
        return false
      }
    }

    if (!authenticated || loadingProfile) {
      return false
    }

    // User explicitly dismissed the modal
    if (userDismissed) {
      return false
    }

    // Don't show modal if user is already fully registered (defensive check)
    if (user?.onChainRegistered && user?.nftTokenId && user?.profileComplete) {
      return false
    }

    // Don't keep showing modal after completion
    if (stage === 'COMPLETED') {
      return true // Show briefly to show success message, but allow closing
    }

    return Boolean(needsOnboarding || needsOnchain || stage === 'ONCHAIN' || stage === 'SOCIAL_IMPORT' || stage === 'PROFILE')
  }, [authenticated, loadingProfile, needsOnboarding, needsOnchain, stage, user, userDismissed])

  useEffect(() => {
    if (!authenticated) {
      setStage('SOCIAL_IMPORT')
      setSubmittedProfile(null)
      setError(null)
      setUserDismissed(false) // Reset dismissed state on logout
      setImportedProfileData(null)
      setHasProgressedPastSocialImport(false)
      return
    }

    if (loadingProfile) {
      return
    }

    if (needsOnboarding) {
      // Don't reset to SOCIAL_IMPORT if user has already progressed past it
      if (!hasProgressedPastSocialImport) {
        setStage('SOCIAL_IMPORT')
        setImportedProfileData(null)
      }
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
      setStage('SOCIAL_IMPORT')
      setSubmittedProfile(null)
      setError(null)
      setImportedProfileData(null)
      setHasProgressedPastSocialImport(false)
    }
  }, [authenticated, loadingProfile, needsOnboarding, needsOnchain, user, submittedProfile, stage, hasProgressedPastSocialImport])

  // Listen for social import callbacks from URL parameters
  useEffect(() => {
    if (typeof window === 'undefined' || !authenticated || stage !== 'SOCIAL_IMPORT') return

    const params = new URLSearchParams(window.location.search)
    const socialImport = params.get('social_import')
    const dataParam = params.get('data')

    if (socialImport && dataParam) {
      try {
        const profileData = JSON.parse(decodeURIComponent(dataParam)) as ImportedProfileData
        logger.info('Social profile data received', { platform: socialImport }, 'OnboardingProvider')
        
        setImportedProfileData(profileData)
        setHasProgressedPastSocialImport(true)
        setStage('PROFILE')
        
        // Clean up URL
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('social_import')
        newUrl.searchParams.delete('data')
        window.history.replaceState({}, '', newUrl.toString())
      } catch (err) {
        logger.error('Failed to parse social import data', { error: err }, 'OnboardingProvider')
      }
    }
  }, [authenticated, stage])

  const submitOnchain = useCallback(
    async (profile: OnboardingProfilePayload, referralCode: string | null) => {
      // Defensive check: skip if user is already fully registered
      if (user?.onChainRegistered && user?.nftTokenId && user?.profileComplete) {
        logger.info(
          'User already fully registered, skipping onchain submission',
          { userId: user.id, nftTokenId: user.nftTokenId },
          'OnboardingProvider'
        )
        setNeedsOnboarding(false)
        setNeedsOnchain(false)
        setStage('COMPLETED')
        return
      }

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

        // Try server-signed registration first (gasless for users)
        try {
          response = await completeWithServer()
        } catch (serverError) {
          const message = extractErrorMessage(serverError).toLowerCase()
          
          // If server signer is not supported or unavailable, fall back to client
          if (
            (message.includes('SERVER_SIGNER_UNSUPPORTED') ||
              message.includes('Server wallet not configured')) &&
            wallet?.address &&
            !user?.isActor
          ) {
            logger.warn(
              'Server-signed registration unavailable; falling back to client signer',
              { error: serverError },
              'OnboardingProvider'
            )
            response = await completeWithClient()
          } else {
            // Re-throw other server errors
            throw serverError
          }
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

  const handleSkipOnchain = useCallback(() => {
    logger.info('User skipped onchain registration', { userId: user?.id }, 'OnboardingProvider')
    setNeedsOnchain(false)
    setUserDismissed(true)
    setStage('SOCIAL_IMPORT')
    setSubmittedProfile(null)
    setError(null)
    setImportedProfileData(null)
  }, [user, setNeedsOnchain])

  const handleSocialImport = useCallback(async (platform: 'twitter' | 'farcaster') => {
    setIsSubmitting(true)
    setError(null)

    try {
      logger.info('Initiating social import', { platform }, 'OnboardingProvider')

      if (platform === 'twitter') {
        // Redirect to Twitter OAuth for onboarding
        window.location.href = '/api/auth/onboarding/twitter/initiate'
      } else if (platform === 'farcaster') {
        // Use Farcaster popup flow
        try {
          const { openFarcasterOnboardingPopup } = await import('@/lib/farcaster-onboarding')
          
          if (!user?.id) {
            throw new Error('User ID not available')
          }

          const profile = await openFarcasterOnboardingPopup(user.id)
          
          // Convert to ImportedProfileData format
          const profileData: ImportedProfileData = {
            platform: 'farcaster',
            username: profile.username,
            displayName: profile.displayName || profile.username,
            bio: profile.bio,
            profileImageUrl: profile.pfpUrl,
            farcasterFid: profile.fid.toString(),
          }

          logger.info('Farcaster profile imported', { username: profile.username, fid: profile.fid }, 'OnboardingProvider')
          
          setImportedProfileData(profileData)
          setHasProgressedPastSocialImport(true)
          setStage('PROFILE')
          setIsSubmitting(false)
        } catch (farcasterError) {
          const errorMessage = farcasterError instanceof Error 
            ? farcasterError.message 
            : 'Failed to authenticate with Farcaster'
          
          logger.error('Farcaster import failed', { error: farcasterError }, 'OnboardingProvider')
          setError(errorMessage)
          setIsSubmitting(false)
        }
      }
    } catch (err) {
      logger.error('Failed to initiate social import', { platform, error: err }, 'OnboardingProvider')
      setError('Failed to connect. Please try again.')
      setIsSubmitting(false)
    }
  }, [user])

  const handleSkipSocialImport = useCallback(() => {
    logger.info('User skipped social import', { userId: user?.id }, 'OnboardingProvider')
    setHasProgressedPastSocialImport(true)
    setStage('PROFILE')
    setImportedProfileData(null)
  }, [user])

  const handleClose = useCallback(() => {
    logger.info('User closed onboarding modal', { 
      stage, 
      needsOnboarding, 
      needsOnchain,
      userRegistered: user?.onChainRegistered 
    }, 'OnboardingProvider')
    
    setUserDismissed(true)
    setStage('SOCIAL_IMPORT')
    setSubmittedProfile(null)
    setError(null)
    setImportedProfileData(null)
    setHasProgressedPastSocialImport(false)
    
    // Clear onboarding flags so modal doesn't keep reappearing
    setNeedsOnboarding(false)
    setNeedsOnchain(false)
  }, [stage, needsOnboarding, needsOnchain, user, setNeedsOnboarding, setNeedsOnchain])

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
          onSkipOnchain={handleSkipOnchain}
          onSocialImport={handleSocialImport}
          onSkipSocialImport={handleSkipSocialImport}
          onClose={handleClose}
          user={user}
          importedData={importedProfileData}
        />
      )}
    </>
  )
}
