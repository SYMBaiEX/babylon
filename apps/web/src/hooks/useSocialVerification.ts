'use client';

import { logger, signInWithFarcaster } from '@babylon/shared';
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
  handleFarcasterOAuth: () => Promise<void>;
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

    sessionStorage.setItem('oauth_return_url', window.location.pathname);
    window.location.href = '/api/auth/twitter/initiate';
  }, [userId]);

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

  const handleFarcasterOAuth = useCallback(async () => {
    if (!userId) {
      toast.error('Please complete your profile first');
      logger.warn(
        'Farcaster OAuth attempted without user ID',
        {},
        'useSocialVerification'
      );
      return;
    }

    try {
      const result = await signInWithFarcaster({
        userId,
        onStatusUpdate: (status) => {
          logger.debug(
            'Farcaster auth status',
            { status },
            'useSocialVerification'
          );
        },
      });

      const token = await getAccessToken();
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/link-farcaster`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: result.message,
            signature: result.signature,
            fid: result.fid,
            username: result.username,
            displayName: result.displayName,
            pfpUrl: result.pfpUrl,
            state: result.state,
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        await refresh();
        await onPointsAwarded();

        if (data.pointsAwarded > 0) {
          toast.success(
            `Farcaster linked! +${data.pointsAwarded} points awarded`
          );
        } else {
          toast.success('Farcaster account linked successfully!');
        }
      } else {
        const errorMessage = data.error || 'Failed to link Farcaster account';
        if (response.status === 409) {
          toast.error(
            errorMessage.includes('already linked')
              ? errorMessage
              : 'This Farcaster account is already linked to another user'
          );
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage === 'Authentication cancelled') {
        logger.info(
          'Farcaster auth cancelled by user',
          { userId },
          'useSocialVerification'
        );
        return;
      }

      if (errorMessage.includes('popup')) {
        toast.error('Please allow popups to connect Farcaster');
        logger.warn(
          'Farcaster popup blocked',
          { userId },
          'useSocialVerification'
        );
        return;
      }

      logger.error(
        'Error during Farcaster authentication',
        { error: errorMessage, userId },
        'useSocialVerification'
      );
      toast.error('Failed to connect Farcaster. Please try again.');
    }
  }, [userId, getAccessToken, refresh, onPointsAwarded]);

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
      'https://discord.gg/4DYsFgyp';
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
