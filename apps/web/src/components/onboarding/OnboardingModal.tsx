'use client';

import type { OnboardingProfilePayload } from '@babylon/shared';
import { cn, logger } from '@babylon/shared';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { apiFetch } from '@/utils/api-fetch';

/**
 * Imported profile data structure from social platforms.
 */
export interface ImportedProfileData {
  platform: 'twitter' | 'farcaster';
  username: string;
  displayName: string;
  bio?: string;
  profileImageUrl?: string | null;
  coverImageUrl?: string | null;
  // Platform-specific IDs
  twitterId?: string;
  farcasterFid?: string;
}

/**
 * Onboarding modal component for user onboarding flow.
 *
 * Provides a multi-stage onboarding interface including profile creation,
 * on-chain registration, and completion. Supports social account import,
 * profile picture/banner selection, and username validation. Handles
 * form submission and error states.
 *
 * Features:
 * - Multi-stage flow (PROFILE, ONCHAIN, COMPLETED)
 * - Profile form (name, username, bio)
 * - Profile picture selection
 * - Banner selection
 * - Social account import
 * - Username validation
 * - On-chain registration
 * - Terms acceptance
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 *
 * @param props - OnboardingModal component props
 * @returns Onboarding modal element or null if not open
 *
 * @example
 * ```tsx
 * <OnboardingModal
 *   isOpen={needsOnboarding}
 *   stage="PROFILE"
 *   isSubmitting={isSubmitting}
 *   onSubmitProfile={handleSubmitProfile}
 *   onClose={() => {}}
 * />
 * ```
 */
interface OnboardingModalProps {
  isOpen: boolean;
  /** Whether to display as full-screen blocking UI (no dismiss) */
  isFullScreen?: boolean;
  stage: 'PROFILE' | 'ONCHAIN' | 'COMPLETED';
  isSubmitting: boolean;
  error?: string | null;
  isWalletReady: boolean;
  onSubmitProfile: (payload: OnboardingProfilePayload) => Promise<void>;
  onRetryOnchain: () => Promise<void>;
  /** Called when onboarding is fully complete (after COMPLETED stage) */
  onComplete: () => void;
  onLogout?: () => Promise<void>;
  user: {
    id?: string;
    username?: string;
    walletAddress?: string;
    onChainRegistered?: boolean;
  } | null;
  importedData?: ImportedProfileData | null;
  /** Whether user logged in via social (Farcaster/Twitter) - skips PROFILE stage */
  isSocialLogin?: boolean;
}

/**
 * Generated profile response structure from API.
 */
interface GeneratedProfileResponse {
  name: string;
  username: string;
  bio: string;
}

/**
 * Random assets response structure from API.
 */
interface RandomAssetsResponse {
  profilePictureIndex: number;
  bannerIndex: number;
}

/**
 * Total number of available profile pictures.
 */
const TOTAL_PROFILE_PICTURES = 100;
/**
 * Total number of available banners.
 */
const TOTAL_BANNERS = 100;
/**
 * Pattern for matching absolute URLs.
 */
const ABSOLUTE_URL_PATTERN = /^(https?:|data:|blob:)/i;

/**
 * Resolve asset URL to absolute URL if needed.
 *
 * Converts relative URLs to absolute URLs for proper image loading.
 *
 * @param value - URL value to resolve
 * @returns Resolved absolute URL or undefined
 */
function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (ABSOLUTE_URL_PATTERN.test(value)) {
    return value;
  }
  if (typeof window !== 'undefined' && value.startsWith('/')) {
    return new URL(value, window.location.origin).toString();
  }
  return value;
}

export function OnboardingModal({
  isOpen,
  isFullScreen: _isFullScreen = true,
  stage,
  isSubmitting,
  error,
  isWalletReady,
  onSubmitProfile,
  onRetryOnchain,
  onComplete,
  onLogout,
  user,
  importedData,
  isSocialLogin: _isSocialLogin = false,
}: OnboardingModalProps) {
  // Simplified form: username serves as display name initially
  const [username, setUsername] = useState('');
  const [profilePictureIndex, setProfilePictureIndex] = useState(1);
  const [bannerIndex, setBannerIndex] = useState(1);
  const [uploadedProfileImage, setUploadedProfileImage] = useState<
    string | null
  >(null);
  const [uploadedBanner, setUploadedBanner] = useState<string | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<
    'available' | 'taken' | null
  >(null);
  const [usernameSuggestion, setUsernameSuggestion] = useState<string | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const currentProfileImage = useMemo(() => {
    return (
      uploadedProfileImage ||
      `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
    );
  }, [uploadedProfileImage, profilePictureIndex]);

  const currentBanner = useMemo(() => {
    return uploadedBanner || `/assets/user-banners/banner-${bannerIndex}.jpg`;
  }, [uploadedBanner, bannerIndex]);

  // Pre-fill form with imported social data
  useEffect(() => {
    if (!importedData || stage !== 'PROFILE') return;

    logger.info(
      'Pre-filling profile with imported data',
      {
        platform: importedData.platform,
        hasProfileImage: !!importedData.profileImageUrl,
        hasCoverImage: !!importedData.coverImageUrl,
      },
      'OnboardingModal'
    );

    // Set username from social data (displayName = username in simplified flow)
    setUsername(importedData.username);

    // If we have a profile image URL from social import, use it
    if (importedData.profileImageUrl) {
      setUploadedProfileImage(importedData.profileImageUrl);
    } else {
      // No social profile image - use a random one
      setUploadedProfileImage(null);
      setProfilePictureIndex(
        Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1
      );
    }

    // Banner is auto-populated randomly (no customization in onboarding)
    setUploadedBanner(null);
    setBannerIndex(Math.floor(Math.random() * TOTAL_BANNERS) + 1);
  }, [importedData, stage]);

  useEffect(() => {
    if (!isOpen || stage !== 'PROFILE') return;

    // Don't auto-generate if we have imported data
    if (importedData) {
      setIsLoadingDefaults(false);
      return;
    }

    const initializeProfile = async () => {
      setIsLoadingDefaults(true);

      const [profileResult, assetsResult] = await Promise.allSettled([
        apiFetch('/api/onboarding/generate-profile', { auth: false }),
        apiFetch('/api/onboarding/random-assets', { auth: false }),
      ]).catch((initError: Error) => {
        logger.warn(
          'Failed to initialize onboarding defaults',
          { error: initError },
          'OnboardingModal'
        );
        return [
          { status: 'rejected' as const, reason: initError },
          { status: 'rejected' as const, reason: initError },
        ];
      });

      if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
        const generated =
          (await profileResult.value.json()) as GeneratedProfileResponse;
        // In simplified flow, username = displayName
        setUsername(generated.username);
      } else {
        setUsername(`user_${Math.random().toString(36).slice(2, 10)}`);
      }

      if (assetsResult.status === 'fulfilled' && assetsResult.value.ok) {
        const assets =
          (await assetsResult.value.json()) as RandomAssetsResponse;
        setProfilePictureIndex(assets.profilePictureIndex);
        setBannerIndex(assets.bannerIndex);
      } else {
        setProfilePictureIndex(
          Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1
        );
        setBannerIndex(Math.floor(Math.random() * TOTAL_BANNERS) + 1);
      }

      setUploadedProfileImage(null);
      setUploadedBanner(null);
      setIsLoadingDefaults(false);
    };

    void initializeProfile();
  }, [isOpen, stage, importedData]);

  useEffect(() => {
    if (stage !== 'PROFILE') return;
    if (!username || username.length < 3) {
      setUsernameStatus(null);
      setUsernameSuggestion(null);
      return;
    }

    let cancelled = false;

    const checkUsername = async () => {
      setIsCheckingUsername(true);
      let status: 'available' | 'taken' | null = null;
      let suggestion: string | null = null;

      const response = await apiFetch(
        `/api/onboarding/check-username?username=${encodeURIComponent(username)}`,
        { auth: false }
      ).catch((checkError: Error) => {
        logger.warn(
          'Username availability check error',
          { error: checkError },
          'OnboardingModal'
        );
        return null;
      });

      if (response?.ok) {
        const result = (await response.json()) as {
          available?: boolean;
          suggestion?: string;
        };
        status = result.available ? 'available' : 'taken';
        suggestion = result.available ? null : (result.suggestion ?? null);
      } else if (response) {
        const body = await response.json();
        logger.warn(
          'Username availability check failed',
          { status: response.status, body },
          'OnboardingModal'
        );
      }

      if (!cancelled) {
        setUsernameStatus(status);
        setUsernameSuggestion(suggestion);
        setIsCheckingUsername(false);
      }
    };

    void checkUsername();

    return () => {
      cancelled = true;
    };
  }, [username, stage]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (stage !== 'PROFILE' || isSubmitting) return;

    setFormError(null);

    // Validate username (which also serves as display name)
    if (!username.trim() || username.length < 3) {
      setFormError('Please pick a username of at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setFormError(
        'Username can only contain letters, numbers, and underscores'
      );
      return;
    }

    if (usernameStatus === 'taken') {
      setFormError('Username is already taken. Please choose another.');
      return;
    }

    if (!acceptedTerms) {
      setFormError(
        'Please accept the Terms of Service and Privacy Policy to continue'
      );
      return;
    }

    // Simplified payload: username = displayName, bio is empty
    const trimmedUsername = username.trim().toLowerCase();
    const profilePayload: OnboardingProfilePayload = {
      username: trimmedUsername,
      displayName: trimmedUsername, // Username serves as display name initially
      bio: '', // Empty bio by default (can be customized later in settings)
      profileImageUrl: resolveAssetUrl(
        uploadedProfileImage ??
          `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
      ),
      coverImageUrl: resolveAssetUrl(
        uploadedBanner ?? `/assets/user-banners/banner-${bannerIndex}.jpg`
      ),
      // Include imported social account data if available
      importedFrom: importedData?.platform || null,
      twitterId:
        importedData?.platform === 'twitter' ? importedData.twitterId : null,
      twitterUsername:
        importedData?.platform === 'twitter' ? importedData.username : null,
      farcasterFid:
        importedData?.platform === 'farcaster'
          ? importedData.farcasterFid
          : null,
      farcasterUsername:
        importedData?.platform === 'farcaster' ? importedData.username : null,
      // Legal acceptance
      tosAccepted: acceptedTerms,
      privacyPolicyAccepted: acceptedTerms,
    };

    await onSubmitProfile(profilePayload);
  };

  /**
   * Simplified profile form for onboarding.
   * - Profile picture: customizable with carousel + upload
   * - Username: required, serves as display name initially
   * - Banner: auto-populated (no customization in onboarding)
   * - Bio: empty by default (can be customized later)
   * - Email: removed (can be added later in settings)
   */
  const renderProfileForm = () => (
    <form onSubmit={handleSubmit} className="space-y-8 p-6 md:p-8">
      {/* Banner preview (auto-populated, no controls) */}
      <div className="-mx-6 -mt-6 md:-mx-8 md:-mt-8 relative h-32 overflow-hidden bg-muted md:h-40">
        <Image
          src={currentBanner}
          alt="Profile banner"
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      {/* Profile picture - centered and prominent with touch-friendly controls */}
      <div className="-mt-16 md:-mt-20 flex flex-col items-center">
        <div className="group relative h-28 w-28 overflow-hidden rounded-full border-4 border-background bg-muted shadow-lg md:h-32 md:w-32">
          <Image
            src={currentProfileImage}
            alt="Profile picture"
            fill
            className="object-cover"
            unoptimized
            priority
          />
          {/* Overlay controls - always visible on mobile, hover on desktop */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => cycleProfilePicture('prev')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm transition-transform hover:bg-background active:scale-95"
              aria-label="Previous avatar"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-background/90 shadow-sm transition-transform hover:bg-background active:scale-95">
              <Upload className="h-5 w-5" />
              <input
                type="file"
                accept="image/*"
                onChange={handleProfileImageUpload}
                className="hidden"
              />
              <span className="sr-only">Upload avatar</span>
            </label>
            <button
              type="button"
              onClick={() => cycleProfilePicture('next')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm transition-transform hover:bg-background active:scale-95"
              aria-label="Next avatar"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-muted-foreground text-xs">
          Choose an avatar or upload your own
        </p>
      </div>

      {/* Username field - prominent and centered */}
      <div className="mx-auto w-full max-w-sm space-y-3 px-2">
        <label htmlFor="username" className="block text-center font-medium">
          Choose your username
        </label>
        <div className="relative">
          <span className="-translate-y-1/2 absolute top-1/2 left-4 font-medium text-muted-foreground">
            @
          </span>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))
            }
            placeholder="your_username"
            className={cn(
              'w-full rounded-xl border-2 bg-muted px-4 py-3.5 pr-12 pl-9 text-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-2',
              usernameStatus === 'available' && 'border-green-500/50',
              usernameStatus === 'taken' && 'border-red-500/50',
              !usernameStatus && 'border-border'
            )}
            maxLength={20}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
          />
          <div className="-translate-y-1/2 absolute top-1/2 right-4">
            {isCheckingUsername && (
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {usernameStatus === 'available' && !isCheckingUsername && (
              <Check className="h-5 w-5 text-green-500" />
            )}
            {usernameStatus === 'taken' && !isCheckingUsername && (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
        </div>
        {usernameStatus === 'taken' && usernameSuggestion && (
          <p className="text-center text-muted-foreground text-sm">
            Username taken. Try:{' '}
            <button
              type="button"
              className="font-medium text-[#0066FF] hover:underline"
              onClick={() => setUsername(usernameSuggestion)}
            >
              @{usernameSuggestion}
            </button>
          </p>
        )}
        {usernameStatus === 'available' && !isCheckingUsername && (
          <p className="text-center text-green-600 text-sm">
            ✓ Username available
          </p>
        )}
        {!usernameStatus && username.length < 3 && username.length > 0 && (
          <p className="text-center text-muted-foreground text-sm">
            Username must be at least 3 characters
          </p>
        )}
        {!usernameStatus && username.length === 0 && (
          <p className="text-center text-muted-foreground text-sm">
            This will be your unique handle on Babylon
          </p>
        )}
      </div>

      {/* Error display */}
      {(formError || error) && (
        <div className="mx-auto flex max-w-sm items-center justify-center gap-2 text-red-500 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{formError || error}</span>
        </div>
      )}

      {/* Terms and submit */}
      <div className="mx-auto w-full max-w-sm space-y-5 px-2">
        <label className="group flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50 active:bg-muted/70">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-[#0066FF] focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-2"
          />
          <span className="text-muted-foreground text-sm leading-relaxed group-hover:text-foreground">
            I accept the{' '}
            <a
              href="https://docs.babylon.market/legal/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#0066FF] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="https://docs.babylon.market/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#0066FF] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Privacy Policy
            </a>
          </span>
        </label>
        <button
          type="submit"
          className={cn(
            'w-full rounded-xl bg-[#0066FF] px-6 py-4 font-semibold text-white shadow-lg transition-all hover:bg-[#0055DD] hover:shadow-xl active:scale-[0.98]',
            (isSubmitting ||
              usernameStatus === 'taken' ||
              !acceptedTerms ||
              username.length < 3) &&
              'cursor-not-allowed opacity-50'
          )}
          disabled={
            isSubmitting ||
            usernameStatus === 'taken' ||
            !acceptedTerms ||
            username.length < 3
          }
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Creating Profile...
            </span>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </form>
  );

  const cycleProfilePicture = (direction: 'next' | 'prev') => {
    setUploadedProfileImage(null);
    setProfilePictureIndex((prev) => {
      if (direction === 'next') {
        return prev >= TOTAL_PROFILE_PICTURES ? 1 : prev + 1;
      }
      return prev <= 1 ? TOTAL_PROFILE_PICTURES : prev - 1;
    });
  };

  const handleProfileImageUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedProfileImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // In full-screen mode, no close button - only logout is available
  // On-chain registration is MANDATORY (no skip option)
  const canLogout = !isSubmitting && onLogout;

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
    }
  };

  const [isVisible, setIsVisible] = useState(false);

  // Trigger fade-in animation after mount
  useEffect(() => {
    if (isOpen) {
      // Small delay to trigger CSS transition
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    return undefined;
  }, [isOpen]);

  if (!isOpen) return null;

  // Full-screen blocking onboarding UI with safe areas for mobile
  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col bg-background transition-opacity duration-300',
        // Safe area padding for notched phones
        'pb-safe',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Header with safe area for notched phones */}
      <div className="flex shrink-0 items-center justify-between border-border border-b px-4 py-4 pt-safe md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-[#0066FF]/10 p-2">
            <Sparkles className="h-5 w-5 text-[#0066FF] md:h-6 md:w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-bold text-lg md:text-xl">
              {stage === 'COMPLETED'
                ? 'Welcome to Babylon!'
                : stage === 'ONCHAIN'
                  ? 'Almost there!'
                  : 'Set up your profile'}
            </h2>
            {stage === 'PROFILE' && importedData && (
              <p className="text-[#0066FF] text-xs">
                Imported from{' '}
                {importedData.platform === 'twitter' ? '𝕏' : 'Farcaster'}
              </p>
            )}
            {user?.username && stage !== 'PROFILE' && (
              <p className="truncate text-muted-foreground text-xs">
                @{user.username}
              </p>
            )}
          </div>
        </div>
        {/* Logout button in header - larger touch target on mobile */}
        {canLogout && (
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-lg px-3 py-2 text-muted-foreground text-sm hover:bg-muted hover:text-foreground active:bg-muted/80"
            disabled={isSubmitting}
          >
            Logout
          </button>
        )}
      </div>

      {/* Main content area - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg">
          {stage === 'COMPLETED' ? (
            <div className="flex flex-col items-center gap-8 p-8 text-center md:p-12">
              {/* Success animation container */}
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 md:h-24 md:w-24">
                  <Check className="h-10 w-10 text-green-500 md:h-12 md:w-12" />
                </div>
                {/* Decorative ring */}
                <div
                  className="absolute inset-0 animate-ping rounded-full bg-green-500/20"
                  style={{ animationDuration: '2s' }}
                />
              </div>
              <div className="space-y-3">
                <h3 className="font-bold text-2xl md:text-3xl">
                  You&apos;re all set! 🎉
                </h3>
                <p className="mx-auto max-w-sm text-muted-foreground">
                  Your profile is ready and you&apos;re registered on the
                  blockchain.
                </p>
              </div>
              <button
                type="button"
                className="w-full max-w-xs rounded-xl bg-[#0066FF] px-8 py-4 font-semibold text-white shadow-lg transition-all hover:bg-[#0055DD] hover:shadow-xl active:scale-[0.98]"
                onClick={onComplete}
              >
                Start Exploring
              </button>
            </div>
          ) : stage === 'ONCHAIN' ? (
            <div className="flex flex-col items-center gap-6 p-8 text-center md:p-12">
              {isSubmitting ? (
                <>
                  <div className="relative flex h-20 w-20 items-center justify-center md:h-24 md:w-24">
                    <div className="absolute inset-0 rounded-full border-4 border-[#0066FF]/20" />
                    <div
                      className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#0066FF]"
                      style={{ animationDuration: '1s' }}
                    />
                    <Sparkles className="h-8 w-8 text-[#0066FF] md:h-10 md:w-10" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg md:text-xl">
                      Registering on-chain...
                    </p>
                    <p className="mx-auto max-w-sm text-muted-foreground text-sm">
                      Confirming your identity on the blockchain. This usually
                      takes 10-30 seconds.
                    </p>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full max-w-xs overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-2 animate-pulse rounded-full bg-[#0066FF]"
                      style={{
                        width: '60%',
                        animation: 'pulse 2s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground/60 text-xs">
                    Please don&apos;t close this window
                  </p>
                </>
              ) : error ? (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 md:h-24 md:w-24">
                    <AlertCircle className="h-10 w-10 text-red-500 md:h-12 md:w-12" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg md:text-xl">
                      Registration Failed
                    </p>
                    <p className="mx-auto max-w-sm text-red-500 text-sm">
                      {error}
                    </p>
                  </div>
                  <div className="mx-auto max-w-sm rounded-lg bg-muted/50 p-4 text-left text-muted-foreground text-sm">
                    <p className="mb-2 font-medium">Troubleshooting tips:</p>
                    <ul className="list-inside list-disc space-y-1 text-xs">
                      <li>Check your internet connection</li>
                      <li>Make sure you have ETH for gas on Base Sepolia</li>
                      <li>Try refreshing and attempting again</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="w-full max-w-xs rounded-xl bg-[#0066FF] px-6 py-4 font-semibold text-white shadow-lg transition-all hover:bg-[#0055DD] hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
                    onClick={onRetryOnchain}
                    disabled={isSubmitting}
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0066FF]/10 md:h-24 md:w-24">
                    <Sparkles className="h-10 w-10 text-[#0066FF] md:h-12 md:w-12" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg md:text-xl">
                      Final Step
                    </p>
                    <p className="mx-auto max-w-sm text-muted-foreground text-sm">
                      Register on the blockchain to unlock all features
                    </p>
                  </div>
                  {/* Features list */}
                  <div className="mx-auto grid w-full max-w-sm gap-3">
                    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-left">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0066FF]/10">
                        <Check className="h-4 w-4 text-[#0066FF]" />
                      </div>
                      <span className="text-sm">
                        On-chain reputation tracking
                      </span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-left">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0066FF]/10">
                        <Check className="h-4 w-4 text-[#0066FF]" />
                      </div>
                      <span className="text-sm">
                        Verifiable trading history
                      </span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-left">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0066FF]/10">
                        <Check className="h-4 w-4 text-[#0066FF]" />
                      </div>
                      <span className="text-sm">
                        NFT-based identity (ERC-8004)
                      </span>
                    </div>
                  </div>
                  {user?.walletAddress && (
                    <p className="rounded-lg bg-muted/50 px-4 py-2 font-mono text-muted-foreground text-xs">
                      {user.walletAddress.slice(0, 8)}...
                      {user.walletAddress.slice(-6)}
                    </p>
                  )}
                  {!isWalletReady && (
                    <div className="flex items-center gap-2 text-amber-500 text-sm">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Preparing your smart wallet...</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={cn(
                      'w-full max-w-xs rounded-xl bg-[#0066FF] px-6 py-4 font-semibold text-white shadow-lg transition-all hover:bg-[#0055DD] hover:shadow-xl active:scale-[0.98]',
                      (!isWalletReady || isSubmitting) &&
                        'cursor-not-allowed opacity-50'
                    )}
                    onClick={onRetryOnchain}
                    disabled={isSubmitting || !isWalletReady}
                  >
                    {isWalletReady
                      ? 'Complete Registration'
                      : 'Preparing Wallet...'}
                  </button>
                </>
              )}
            </div>
          ) : isLoadingDefaults ? (
            <div className="flex flex-col items-center p-6 md:p-8">
              {/* Banner skeleton */}
              <Skeleton className="-mx-6 -mt-6 md:-mx-8 md:-mt-8 h-32 w-[calc(100%+48px)] md:h-40 md:w-[calc(100%+64px)]" />
              {/* Avatar skeleton */}
              <Skeleton className="-mt-14 md:-mt-16 h-28 w-28 rounded-full border-4 border-background md:h-32 md:w-32" />
              {/* Text skeletons */}
              <div className="mt-6 w-full max-w-sm space-y-4">
                <Skeleton className="mx-auto h-6 w-40" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="mx-auto h-4 w-48" />
              </div>
              {/* Terms and button skeleton */}
              <div className="mt-6 w-full max-w-sm space-y-4">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            renderProfileForm()
          )}
        </div>
      </div>

      {/* Progress indicator */}
      <div className="shrink-0 border-border border-t px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-xs items-center justify-center gap-3">
          {/* Step 1: Profile */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs transition-all',
                stage === 'PROFILE'
                  ? 'bg-[#0066FF] text-white'
                  : stage === 'ONCHAIN' || stage === 'COMPLETED'
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {stage === 'ONCHAIN' || stage === 'COMPLETED' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                '1'
              )}
            </div>
            <span className="hidden text-xs sm:inline">Profile</span>
          </div>

          {/* Connector */}
          <div
            className={cn(
              'h-0.5 w-8 rounded-full transition-colors',
              stage === 'ONCHAIN' || stage === 'COMPLETED'
                ? 'bg-green-500'
                : 'bg-muted'
            )}
          />

          {/* Step 2: On-chain */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs transition-all',
                stage === 'ONCHAIN'
                  ? 'bg-[#0066FF] text-white'
                  : stage === 'COMPLETED'
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {stage === 'COMPLETED' ? <Check className="h-3.5 w-3.5" /> : '2'}
            </div>
            <span className="hidden text-xs sm:inline">Register</span>
          </div>

          {/* Connector */}
          <div
            className={cn(
              'h-0.5 w-8 rounded-full transition-colors',
              stage === 'COMPLETED' ? 'bg-green-500' : 'bg-muted'
            )}
          />

          {/* Step 3: Complete */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs transition-all',
                stage === 'COMPLETED'
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {stage === 'COMPLETED' ? <Check className="h-3.5 w-3.5" /> : '3'}
            </div>
            <span className="hidden text-xs sm:inline">Done</span>
          </div>
        </div>
      </div>
    </div>
  );
}
