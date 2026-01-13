'use client';

import type { OnboardingProfilePayload } from '@babylon/shared';
import {
  CHAIN,
  getWalletErrorMessage,
  logger,
  POINTS,
  WALLET_ERROR_MESSAGES,
} from '@babylon/shared';
import { useIdentityToken, usePrivy } from '@privy-io/react-auth';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type ImportedProfileData,
  OnboardingModal,
} from '@/components/onboarding/OnboardingModal';
import { useAuth } from '@/hooks/useAuth';
import { useRegisterAgentTx } from '@/hooks/useRegisterAgentTx';
import { apiFetch } from '@/utils/api-fetch';

/**
 * Check if we're on a local network where smart wallets aren't supported.
 * Smart wallets (ERC-4337) require bundler infrastructure that only exists
 * on supported chains like Base/Base Sepolia, not on local Hardhat networks.
 */
const isLocalNetwork = CHAIN.id === 31337;

import type { JsonValue } from '@babylon/shared';
import { type User as StoreUser, useAuthStore } from '@/stores/authStore';

import { clearReferralCode, getReferralCode } from './ReferralCaptureProvider';

/**
 * Onboarding stage type for multi-step onboarding flow.
 */
type OnboardingStage = 'PROFILE' | 'ONCHAIN' | 'COMPLETED';

/**
 * Onboarding provider component for managing user onboarding flow.
 *
 * Manages the complete onboarding process including profile creation,
 * on-chain registration, and social account linking. Handles full-screen
 * onboarding display, form submission, error handling, and progress tracking.
 * Integrates with Privy authentication and smart wallet registration.
 *
 * Features:
 * - Multi-stage onboarding (PROFILE, ONCHAIN, COMPLETED)
 * - Full-screen blocking onboarding (user cannot access app until complete)
 * - Profile creation form (simplified: username + picture + terms)
 * - On-chain agent registration (MANDATORY - no skip option)
 * - Social account import (Farcaster, Twitter) - skips PROFILE stage
 * - Referral code handling
 * - Error handling and retry logic
 *
 * Flow:
 * - Wallet users: PROFILE → ONCHAIN → COMPLETED
 * - Social (Farcaster/Twitter) users: ONCHAIN → COMPLETED (profile auto-imported)
 *
 * @param props - OnboardingProvider component props
 * @returns Onboarding provider element
 */
export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    authenticated,
    user,
    needsOnboarding,
    needsOnchain,
    loadingProfile,
    refresh,
    logout,
  } = useAuth();

  const { user: privyUser } = usePrivy();

  // Detect if user authenticated via social login (Farcaster or Twitter)
  // These users skip the PROFILE stage - their data is auto-imported
  const isSocialLogin = useMemo(() => {
    if (!privyUser) return false;
    const userWithSocial = privyUser as typeof privyUser & {
      farcaster?: { username?: string };
      twitter?: { username?: string };
    };
    return !!(
      userWithSocial.farcaster?.username || userWithSocial.twitter?.username
    );
  }, [privyUser]);

  const { setUser, setNeedsOnboarding, setNeedsOnchain } = useAuthStore();
  const { identityToken } = useIdentityToken();
  const { registerAgent, smartWalletAddress, smartWalletReady } =
    useRegisterAgentTx();

  const [stage, setStage] = useState<OnboardingStage>('PROFILE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedProfile, setSubmittedProfile] =
    useState<OnboardingProfilePayload | null>(null);
  const [importedProfileData, setImportedProfileData] =
    useState<ImportedProfileData | null>(null);
  const [_hasProgressedPastSocialImport, setHasProgressedPastSocialImport] =
    useState(false);
  const [pendingOnchainSubmission, setPendingOnchainSubmission] =
    useState<OnboardingProfilePayload | null>(null);
  const [onchainReferralCode, setOnchainReferralCode] = useState<string | null>(
    null
  );
  // Store last client-submitted registration txHash so retries can sync without re-signing
  const [onchainTxHash, setOnchainTxHash] = useState<string | null>(null);

  // Track if social user has auto-submitted profile
  const socialAutoSubmitRef = useRef(false);
  // Prevent duplicate on-chain submissions (e.g. StrictMode double-invoking effects)
  const onchainSubmitInFlightRef = useRef(false);

  // Delay onboarding display to prevent flickering
  const [isReadyToShow, setIsReadyToShow] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Wait for app to stabilize before showing onboarding
  useEffect(() => {
    if (!authenticated || loadingProfile) {
      setIsReadyToShow(false);
      setHasInitialized(false);
      return;
    }

    // If already initialized and conditions change, show immediately
    if (hasInitialized) {
      setIsReadyToShow(true);
      return;
    }

    // First time: wait 1-1.5 seconds for app to load (shorter delay for blocking UI)
    const delay = Math.random() * 500 + 1000; // 1-1.5 seconds
    const timer = setTimeout(() => {
      setIsReadyToShow(true);
      setHasInitialized(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [authenticated, loadingProfile, hasInitialized]);

  // If needsOnboarding is manually set to true, show onboarding immediately
  useEffect(() => {
    if (needsOnboarding && authenticated && !loadingProfile) {
      setIsReadyToShow(true);
      setHasInitialized(true);
    }
  }, [needsOnboarding, authenticated, loadingProfile]);

  /**
   * Determines if onboarding should be shown (full-screen blocking).
   * Unlike before, this is NOT dismissible - users must complete onboarding.
   * On-chain registration is MANDATORY.
   */
  const shouldShowOnboarding = useMemo(() => {
    // Check if dev mode is enabled via URL parameter
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isDevMode = params.get('dev') === 'true';
      const isProduction = window.location.hostname === 'babylon.market';
      const isHomePage = window.location.pathname === '/';
      const isWaitlistFlow = params.get('waitlist') === 'true';

      // Hide onboarding on production (babylon.market) on home page unless ?dev=true
      // BUT allow it if user is in waitlist flow (coming from waitlist signup)
      if (isProduction && isHomePage && !isDevMode && !isWaitlistFlow) {
        return false;
      }
    }

    // Don't show until ready (prevents flickering)
    if (!isReadyToShow) {
      return false;
    }

    if (!authenticated || loadingProfile) {
      return false;
    }

    // Don't show onboarding if user is already fully registered
    // Both profileComplete AND onChainRegistered must be true
    if (user?.onChainRegistered && user?.profileComplete) {
      return false;
    }

    // Show briefly after completion to display success message
    if (stage === 'COMPLETED') {
      return true;
    }

    // Show onboarding when backend says user needs to complete steps
    // On-chain registration is now MANDATORY (no skip option)
    return Boolean(needsOnboarding || needsOnchain);
  }, [
    isReadyToShow,
    authenticated,
    loadingProfile,
    needsOnboarding,
    needsOnchain,
    stage,
    user,
  ]);

  const handleProfileSubmit = useCallback(
    async (payload: OnboardingProfilePayload) => {
      setIsSubmitting(true);
      setError(null);

      const referralCode = getReferralCode();

      logger.info(
        'Identity token state during signup',
        {
          present: Boolean(identityToken),
          tokenPreview: identityToken ? `${identityToken.slice(0, 12)}...` : null,
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

      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error ||
          `Failed to complete signup (status ${response.status})`;
        setIsSubmitting(false);
        throw new Error(message);
      }

      if (data.user) {
        setUser({
          id: data.user.id,
          walletAddress: data.user.walletAddress ?? smartWalletAddress ?? undefined,
          displayName: data.user.displayName ?? payload.displayName,
          email: user?.email,
          username: data.user.username ?? payload.username,
          bio: data.user.bio ?? payload.bio,
          profileImageUrl:
            data.user.profileImageUrl ?? payload.profileImageUrl ?? undefined,
          coverImageUrl:
            data.user.coverImageUrl ?? payload.coverImageUrl ?? undefined,
          profileComplete: data.user.profileComplete ?? true,
          reputationPoints: data.user.reputationPoints ?? user?.reputationPoints,
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
      setOnchainReferralCode(referralCode ?? null);
      setOnchainTxHash(null);
      setPendingOnchainSubmission({ ...payload });
      setStage('ONCHAIN');
      setIsSubmitting(false);
    },
    [
      user,
      setUser,
      setNeedsOnboarding,
      setNeedsOnchain,
      identityToken,
      smartWalletAddress,
    ]
  );

  useEffect(() => {
    if (!authenticated) {
      setStage('PROFILE');
      setSubmittedProfile(null);
      setError(null);
      setImportedProfileData(null);
      setHasProgressedPastSocialImport(false);
      setPendingOnchainSubmission(null);
      setOnchainReferralCode(null);
      setOnchainTxHash(null);
      socialAutoSubmitRef.current = false;
      onchainSubmitInFlightRef.current = false;
      return;
    }

    if (loadingProfile) {
      return;
    }

    if (needsOnboarding) {
      // For social login users (Farcaster/Twitter), skip PROFILE and auto-submit
      // They go straight to ONCHAIN stage with auto-imported profile data
      if (
        isSocialLogin &&
        importedProfileData &&
        !socialAutoSubmitRef.current
      ) {
        // Mark as auto-submitting to prevent duplicate submissions
        socialAutoSubmitRef.current = true;
        logger.info(
          'Social login user - auto-submitting profile and skipping to ONCHAIN',
          {
            platform: importedProfileData.platform,
            username: importedProfileData.username,
          },
          'OnboardingProvider'
        );
        // Auto-submit profile for social users - this will trigger ONCHAIN stage
        const autoProfile: OnboardingProfilePayload = {
          username: importedProfileData.username,
          displayName: importedProfileData.displayName,
          bio: '', // Empty bio by default
          profileImageUrl: importedProfileData.profileImageUrl ?? undefined,
          coverImageUrl: undefined, // Auto-populated by backend
          importedFrom: importedProfileData.platform,
          twitterId: importedProfileData.twitterId ?? null,
          twitterUsername:
            importedProfileData.platform === 'twitter'
              ? importedProfileData.username
              : null,
          farcasterFid: importedProfileData.farcasterFid ?? null,
          farcasterUsername:
            importedProfileData.platform === 'farcaster'
              ? importedProfileData.username
              : null,
          tosAccepted: true, // Social login implies acceptance
          privacyPolicyAccepted: true,
        };
        // Handle auto-submit with proper error handling
        handleProfileSubmit(autoProfile).catch((submitError: Error) => {
          logger.error(
            'Social login auto-submit failed',
            { error: submitError.message, platform: importedProfileData.platform },
            'OnboardingProvider'
          );
          setError(submitError.message);
          // Reset the ref so user can retry via the UI
          socialAutoSubmitRef.current = false;
          // Fall back to manual profile entry
          setStage('PROFILE');
        });
        return;
      }
      // Non-social users: start at profile setup
      setStage('PROFILE');
      return;
    }

    if (needsOnchain) {
      if (!submittedProfile && user) {
        setSubmittedProfile({
          username: user.username ?? `user_${user.id.slice(0, 8)}`,
          displayName: user.displayName ?? user.username ?? 'New User',
          bio: '', // Empty bio by default
          profileImageUrl: user.profileImageUrl ?? undefined,
          coverImageUrl: user.coverImageUrl ?? undefined,
        });
      }
      setStage((prev) => (prev === 'COMPLETED' ? prev : 'ONCHAIN'));
      return;
    }

    // User has completed onboarding - don't reset stage or show onboarding
  }, [
    authenticated,
    loadingProfile,
    needsOnboarding,
    needsOnchain,
    user,
    submittedProfile,
    isSocialLogin,
    importedProfileData,
    handleProfileSubmit,
  ]);

  // Automatically extract social profile data from Privy user when authenticating
  useEffect(() => {
    if (!authenticated || !privyUser || !needsOnboarding) return;
    if (importedProfileData) return; // Already have imported data
    if (loadingProfile) return; // Wait for profile to load

    const userWithFarcaster = privyUser as typeof privyUser & {
      farcaster?: {
        username?: string;
        displayName?: string;
        bio?: string;
        pfp?: string;
        pfpUrl?: string;
        fid?: number;
        url?: string;
        ownerAddress?: string;
        verifications?: string[];
      };
    };
    const userWithTwitter = privyUser as typeof privyUser & {
      twitter?: {
        username?: string;
        name?: string;
        profilePictureUrl?: string;
        subject?: string; // Twitter user ID
      };
    };

    // Check if user authenticated with Farcaster
    if (userWithFarcaster.farcaster) {
      const fc = userWithFarcaster.farcaster;

      // Use pfpUrl or pfp, whichever is available
      const profileImage = fc.pfpUrl || fc.pfp || null;

      const profileData: ImportedProfileData = {
        platform: 'farcaster',
        username:
          fc.username ||
          fc.displayName?.toLowerCase().replace(/\s+/g, '_') ||
          'farcaster_user',
        displayName: fc.displayName || fc.username || 'Farcaster User',
        bio: fc.bio || undefined,
        profileImageUrl: profileImage,
        farcasterFid: fc.fid?.toString(),
      };

      logger.info(
        'Auto-imported Farcaster profile from Privy - will award points on signup',
        {
          username: profileData.username,
          displayName: profileData.displayName,
          fid: fc.fid,
          hasBio: !!profileData.bio,
          hasProfileImage: !!profileImage,
          rewardEligible: true,
          expectedPoints: POINTS.FARCASTER_LINK,
        },
        'OnboardingProvider'
      );

      setImportedProfileData(profileData);
      setHasProgressedPastSocialImport(true);
      return;
    }

    // Check if user authenticated with Twitter
    if (userWithTwitter.twitter) {
      const tw = userWithTwitter.twitter;

      // Upgrade Twitter profile image to higher resolution if available
      let profileImageUrl = tw.profilePictureUrl;
      if (profileImageUrl && profileImageUrl.includes('_normal')) {
        profileImageUrl = profileImageUrl.replace('_normal', '_400x400');
      }

      const profileData: ImportedProfileData = {
        platform: 'twitter',
        username: tw.username || 'twitter_user',
        displayName: tw.name || tw.username || 'Twitter User',
        bio: undefined, // Twitter bio not directly available from Privy, would need separate API call
        profileImageUrl: profileImageUrl || null,
        twitterId: tw.subject || tw.username, // Use subject (Twitter user ID) if available
      };

      logger.info(
        'Auto-imported Twitter profile from Privy - will award points on signup',
        {
          username: profileData.username,
          displayName: profileData.displayName,
          twitterId: profileData.twitterId,
          hasProfileImage: !!profileImageUrl,
          rewardEligible: true,
          expectedPoints: POINTS.TWITTER_LINK,
        },
        'OnboardingProvider'
      );

      setImportedProfileData(profileData);
      setHasProgressedPastSocialImport(true);
      return;
    }

    // For wallet-only logins, don't set imported data - let the generated profile flow handle it
    logger.info(
      'User authenticated with wallet only - will use generated profile',
      { userId: privyUser.id },
      'OnboardingProvider'
    );
  }, [
    authenticated,
    privyUser,
    needsOnboarding,
    importedProfileData,
    loadingProfile,
  ]);

  // Listen for social import callbacks from URL parameters (for manual social linking)
  useEffect(() => {
    if (typeof window === 'undefined' || !authenticated) return;

    const params = new URLSearchParams(window.location.search);
    const socialImport = params.get('social_import');
    const dataParam = params.get('data');

    if (socialImport && dataParam) {
      const profileData = JSON.parse(
        decodeURIComponent(dataParam)
      ) as ImportedProfileData;
      logger.info(
        'Social profile data received from URL',
        { platform: socialImport },
        'OnboardingProvider'
      );

      setImportedProfileData(profileData);
      setHasProgressedPastSocialImport(true);
      setStage('PROFILE');

      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('social_import');
      newUrl.searchParams.delete('data');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [authenticated]);

  const submitOnchain = useCallback(
    async (profile: OnboardingProfilePayload, referralCode: string | null) => {
      // Defensive check: skip if user is already fully registered
      if (
        user?.onChainRegistered &&
        user?.nftTokenId &&
        user?.profileComplete
      ) {
        logger.info(
          'User already fully registered, skipping onchain submission',
          { userId: user.id, nftTokenId: user.nftTokenId },
          'OnboardingProvider'
        );
        setNeedsOnboarding(false);
        setNeedsOnchain(false);
        setStage('COMPLETED');
        return;
      }

      const body = {
        walletAddress: smartWalletAddress ?? null,
        referralCode: referralCode ?? null,
      };

      const callEndpoint = async (payload: Record<string, string | null>) => {
        const response = await apiFetch('/api/users/onboarding/onchain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          const rawError = data?.error;
          const message =
            (typeof rawError === 'string'
              ? rawError
              : typeof rawError?.message === 'string'
                ? rawError.message
                : null) ??
            `Failed to complete on-chain onboarding (status ${response.status})`;
          throw new Error(message);
        }
        return data as {
          onchain: Record<string, JsonValue>;
          user: StoreUser | null;
        };
      };

      const applyResponse = (data: {
        onchain: Record<string, JsonValue>;
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
        setOnchainTxHash(null);
        void refresh().catch(() => undefined);
      };

      const completeWithClient = async () => {
        // On local networks (Hardhat), smart wallets (ERC-4337) don't work because
        // there's no bundler infrastructure. Fall back to backend-signed transactions.
        if (isLocalNetwork) {
          logger.info(
            'Local network detected - using backend-signed registration (no bundler available)',
            { chainId: CHAIN.id },
            'OnboardingProvider'
          );
          const data = await callEndpoint(body);
          applyResponse(data);
          return;
        }

        if (!smartWalletReady || !smartWalletAddress) {
          throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
        }

        // If we already have a tx hash from a previous attempt, reuse it so the
        // user doesn't need to sign a second time just to sync backend state.
        if (onchainTxHash) {
          logger.info(
            'Reusing existing on-chain registration txHash for backend sync',
            { txHash: onchainTxHash },
            'OnboardingProvider'
          );
          const data = await callEndpoint({
            ...body,
            txHash: onchainTxHash,
          });
          applyResponse(data);
          return;
        }

        logger.info(
          'Attempting client-signed on-chain registration',
          { address: smartWalletAddress },
          'OnboardingProvider'
        );

        // Check if wallet is already registered before submitting transaction
        // If already registered, the server will handle syncing the state
        const registrationResult = await registerAgent(profile).catch(
          (txError: Error) => {
            const errorMessage = txError.message.toLowerCase();
            // If the error is "already registered", don't throw - let the server handle it
            if (errorMessage.includes('already registered')) {
              logger.info(
                'Wallet already registered on-chain, syncing with server',
                { address: smartWalletAddress },
                'OnboardingProvider'
              );
              return 'already-registered';
            }
            // For other errors, re-throw
            throw txError;
          }
        );

        if (registrationResult === 'already-registered') {
          // Call the endpoint without a txHash - server will detect existing registration
          const data = await callEndpoint(body);
          applyResponse(data);
          return;
        }

        const txHash = registrationResult as string;
        // Persist txHash immediately so a server/network error won't force a re-sign
        setOnchainTxHash(txHash);
        logger.info(
          'Client-submitted on-chain registration transaction',
          { txHash },
          'OnboardingProvider'
        );

        const data = await callEndpoint({
          ...body,
          txHash,
        });
        applyResponse(data);
      };

      const response = await completeWithClient().catch((rawError: Error) => {
        // Use wallet-aware error message
        const userFriendlyMessage = getWalletErrorMessage(rawError);
        setError(userFriendlyMessage);
        logger.error(
          'Failed to complete on-chain onboarding',
          { error: rawError.message },
          'OnboardingProvider'
        );
        return null;
      });

      if (!response) return;
    },
    [
      onchainTxHash,
      smartWalletReady,
      refresh,
      registerAgent,
      setNeedsOnboarding,
      setNeedsOnchain,
      setUser,
      smartWalletAddress,
      user,
    ]
  );

  useLayoutEffect(() => {
    // On local networks, we use backend signing so smart wallet isn't required
    const walletReady =
      isLocalNetwork || (smartWalletReady && smartWalletAddress);

    if (
      stage !== 'ONCHAIN' ||
      !pendingOnchainSubmission ||
      !walletReady ||
      isSubmitting ||
      onchainSubmitInFlightRef.current
    ) {
      return;
    }

    onchainSubmitInFlightRef.current = true;
    setIsSubmitting(true);
    setError(null);
    void submitOnchain(pendingOnchainSubmission, onchainReferralCode).finally(
      () => {
        setPendingOnchainSubmission(null);
        setIsSubmitting(false);
        onchainSubmitInFlightRef.current = false;
      }
    );
  }, [
    stage,
    pendingOnchainSubmission,
    smartWalletReady,
    smartWalletAddress,
    isSubmitting,
    submitOnchain,
    onchainReferralCode,
  ]);

  const handleRetryOnchain = useCallback(async () => {
    if (!submittedProfile) return;
    setError(null);

    setOnchainReferralCode((prev) => prev ?? getReferralCode());
    setPendingOnchainSubmission({ ...submittedProfile });
  }, [submittedProfile]);

  // Handler for completion - closes the onboarding screen
  const handleComplete = useCallback(() => {
    logger.info(
      'User completed onboarding',
      {
        stage,
        userId: user?.id,
        onChainRegistered: user?.onChainRegistered,
      },
      'OnboardingProvider'
    );
    // Reset stage to allow re-entry if needed (defensive)
    setStage('PROFILE');
  }, [stage, user]);

  // Full-screen blocking onboarding - user cannot access app until complete
  // On-chain registration is MANDATORY (no skip option)
  if (shouldShowOnboarding) {
    return (
      <OnboardingModal
        isOpen
        isFullScreen
        stage={stage}
        isSubmitting={isSubmitting}
        error={error}
        isWalletReady={Boolean(smartWalletReady && smartWalletAddress)}
        onSubmitProfile={handleProfileSubmit}
        onRetryOnchain={handleRetryOnchain}
        onComplete={handleComplete}
        onLogout={logout}
        user={user}
        importedData={importedProfileData}
        isSocialLogin={isSocialLogin}
      />
    );
  }

  // User has completed onboarding - render children (the app)
  return <>{children}</>;
}
