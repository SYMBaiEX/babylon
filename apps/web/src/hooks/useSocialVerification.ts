'use client';

import { logger } from '@babylon/shared';
import { useLinkAccount } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface UseSocialVerificationOptions {
  authenticated: boolean;
  userId: string | undefined;
  hasFarcaster: boolean | undefined;
  hasTwitter: boolean | undefined;
  hasDiscord: boolean | undefined;
  pointsAwardedForFarcasterFollow: boolean | undefined;
  pointsAwardedForTwitterFollow: boolean | undefined;
  pointsAwardedForDiscordJoin: boolean | undefined;
  onPointsAwarded: () => Promise<void>;
}

interface UseSocialVerificationReturn {
  // Farcaster
  hasFarcasterFollow: boolean;
  isVerifyingFollow: boolean;
  showVerifyFollowButton: boolean;
  handleFarcasterOAuth: () => void;
  handleFarcasterFollow: () => void;
  handleVerifyFollow: () => Promise<void>;
  // Twitter
  hasTwitterFollow: boolean;
  isVerifyingTwitterFollow: boolean;
  showVerifyTwitterFollowButton: boolean;
  handleTwitterOAuth: () => void;
  handleTwitterFollow: () => void;
  handleVerifyTwitterFollow: () => Promise<void>;
  // Discord
  hasDiscordJoin: boolean;
  isVerifyingDiscordJoin: boolean;
  showVerifyDiscordJoinButton: boolean;
  handleDiscordOAuth: () => void;
  handleDiscordJoin: () => void;
  handleVerifyDiscordJoin: () => Promise<void>;
}

export function useSocialVerification({
  authenticated,
  userId,
  hasFarcaster,
  hasTwitter,
  hasDiscord,
  pointsAwardedForFarcasterFollow,
  pointsAwardedForTwitterFollow,
  pointsAwardedForDiscordJoin,
  onPointsAwarded,
}: UseSocialVerificationOptions): UseSocialVerificationReturn {
  const { getAccessToken, refresh } = useAuth();

  const { linkFarcaster, linkTwitter } = useLinkAccount({
    onSuccess: async ({ linkedAccount }) => {
      if (
        linkedAccount.type !== 'farcaster_account' &&
        linkedAccount.type !== 'twitter_oauth'
      )
        return;

      await refresh();
      await onPointsAwarded();

      if (linkedAccount.type === 'farcaster_account') {
        toast.success('Farcaster account linked successfully!');
      } else {
        toast.success('X account linked successfully!');
      }
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        error === 'exited_auth_flow' ||
        errorMessage === 'Authentication cancelled'
      ) {
        logger.info(
          'Social account linking cancelled by user',
          { userId },
          'useSocialVerification'
        );
        return;
      }

      logger.error(
        'Failed to link social account via Privy',
        { error: errorMessage, userId },
        'useSocialVerification'
      );
      toast.error('Failed to link account. Please try again.');
    },
  });

  // Farcaster state
  const [hasFarcasterFollow, setHasFarcasterFollow] = useState(false);
  const [isVerifyingFollow, setIsVerifyingFollow] = useState(false);
  const [showVerifyFollowButton, setShowVerifyFollowButton] = useState(false);

  // Twitter state
  const [hasTwitterFollow, setHasTwitterFollow] = useState(false);
  const [isVerifyingTwitterFollow, setIsVerifyingTwitterFollow] =
    useState(false);
  const [showVerifyTwitterFollowButton, setShowVerifyTwitterFollowButton] =
    useState(false);

  // Discord state
  const [hasDiscordJoin, setHasDiscordJoin] = useState(false);
  const [isVerifyingDiscordJoin, setIsVerifyingDiscordJoin] = useState(false);
  const [showVerifyDiscordJoinButton, setShowVerifyDiscordJoinButton] =
    useState(false);

  // Check if user has already been awarded follow rewards on page load
  useEffect(() => {
    if (!authenticated || !userId) return;

    if (pointsAwardedForFarcasterFollow) {
      setHasFarcasterFollow(true);
    }

    if (pointsAwardedForTwitterFollow) {
      setHasTwitterFollow(true);
    }

    if (pointsAwardedForDiscordJoin) {
      setHasDiscordJoin(true);
    }
  }, [
    authenticated,
    userId,
    pointsAwardedForFarcasterFollow,
    pointsAwardedForTwitterFollow,
    pointsAwardedForDiscordJoin,
  ]);

  // OAuth handlers
  const handleTwitterOAuth = useCallback(() => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Twitter OAuth attempted without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    linkTwitter();
  }, [linkTwitter, userId]);

  const handleDiscordOAuth = useCallback(() => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Discord OAuth attempted without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    sessionStorage.setItem('oauth_return_url', window.location.pathname);
    window.location.href = '/api/auth/discord/initiate';
  }, [userId]);

  const handleFarcasterOAuth = useCallback(() => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Farcaster OAuth attempted without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    linkFarcaster();
  }, [linkFarcaster, userId]);

  // Farcaster follow handlers
  const handleFarcasterFollow = useCallback(() => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Farcaster follow link clicked without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    if (!hasFarcaster) {
      toast.error('Please link your Farcaster account first');
      return;
    }

    window.open('https://warpcast.com/playbabylon', '_blank');
    setShowVerifyFollowButton(true);
    toast.success('After following, click the "Verify Follow" button below!');
  }, [userId, hasFarcaster]);

  const handleVerifyFollow = useCallback(async () => {
    if (!userId) return;

    setIsVerifyingFollow(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/verify-farcaster-follow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.verified) {
        setHasFarcasterFollow(true);
        setShowVerifyFollowButton(false);
        await onPointsAwarded();

        if (data.points?.awarded > 0) {
          toast.success(
            `Follow verified! +${data.points.awarded} points awarded`
          );
        } else {
          toast.success(
            'Follow verified! You already received points for this action.'
          );
        }
      } else {
        toast.error(
          data.message ||
            'Could not verify follow. Please make sure you followed @playbabylon on Farcaster.'
        );
      }
    } catch (error) {
      logger.error(
        'Error verifying Farcaster follow',
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'useSocialVerification'
      );
      toast.error('Failed to verify follow. Please try again.');
    } finally {
      setIsVerifyingFollow(false);
    }
  }, [userId, getAccessToken, onPointsAwarded]);

  // Twitter follow handlers
  const handleTwitterFollow = useCallback(() => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Twitter follow link clicked without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    if (!hasTwitter) {
      toast.error('Please link your Twitter account first');
      return;
    }

    window.open(
      'https://x.com/intent/follow?screen_name=PlayBabylon',
      '_blank'
    );
    setShowVerifyTwitterFollowButton(true);
    toast.success('After following, click the "Claim Reward" button below!');
  }, [userId, hasTwitter]);

  const handleVerifyTwitterFollow = useCallback(async () => {
    if (!userId) return;

    setIsVerifyingTwitterFollow(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/verify-twitter-follow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.verified) {
        setHasTwitterFollow(true);
        setShowVerifyTwitterFollowButton(false);
        await onPointsAwarded();

        if (data.points?.awarded > 0) {
          toast.success(
            `Thank you for following! +${data.points.awarded} points awarded`
          );
        } else {
          toast.success('You already received points for this action.');
        }
      } else {
        toast.error(
          data.message || 'Could not claim reward. Please try again.'
        );
      }
    } catch (error) {
      logger.error(
        'Error claiming Twitter follow reward',
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'useSocialVerification'
      );
      toast.error('Failed to claim reward. Please try again.');
    } finally {
      setIsVerifyingTwitterFollow(false);
    }
  }, [userId, getAccessToken, onPointsAwarded]);

  // Discord join handlers
  const handleDiscordJoin = useCallback(() => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Discord join link clicked without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    if (!hasDiscord) {
      toast.error('Please link your Discord account first');
      return;
    }

    const discordInviteUrl =
      process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ||
      'https://discord.gg/FEJpGH8f3r';
    window.open(discordInviteUrl, '_blank');
    setShowVerifyDiscordJoinButton(true);
    toast.success('After joining, click the "Verify Join" button below!');
  }, [userId, hasDiscord]);

  const handleVerifyDiscordJoin = useCallback(async () => {
    if (!userId) return;

    setIsVerifyingDiscordJoin(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/verify-discord-join`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.verified) {
        setHasDiscordJoin(true);
        setShowVerifyDiscordJoinButton(false);
        await onPointsAwarded();

        if (data.points?.awarded > 0) {
          toast.success(
            `Discord membership verified! +${data.points.awarded} points awarded`
          );
        } else {
          toast.success(
            'Membership verified! You already received points for this action.'
          );
        }
      } else {
        toast.error(
          data.message ||
            'Could not verify membership. Please make sure you joined the Babylon Discord server.'
        );
      }
    } catch (error) {
      logger.error(
        'Error verifying Discord join',
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'useSocialVerification'
      );
      toast.error('Failed to verify Discord membership. Please try again.');
    } finally {
      setIsVerifyingDiscordJoin(false);
    }
  }, [userId, getAccessToken, onPointsAwarded]);

  return {
    // Farcaster
    hasFarcasterFollow,
    isVerifyingFollow,
    showVerifyFollowButton,
    handleFarcasterOAuth,
    handleFarcasterFollow,
    handleVerifyFollow,
    // Twitter
    hasTwitterFollow,
    isVerifyingTwitterFollow,
    showVerifyTwitterFollowButton,
    handleTwitterOAuth,
    handleTwitterFollow,
    handleVerifyTwitterFollow,
    // Discord
    hasDiscordJoin,
    isVerifyingDiscordJoin,
    showVerifyDiscordJoinButton,
    handleDiscordOAuth,
    handleDiscordJoin,
    handleVerifyDiscordJoin,
  };
}
