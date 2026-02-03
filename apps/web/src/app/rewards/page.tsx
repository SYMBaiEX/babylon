'use client';

import {
  getProfileUrl,
  getReferralShareText,
  getReferralUrl,
  POINTS,
} from '@babylon/shared';
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DailyStreakCard } from '@/components/daily-login';
import { LinkSocialAccountsModal } from '@/components/profile/LinkSocialAccountsModal';
import { RewardsSkeleton } from '@/components/rewards/RewardsSkeleton';
import { RewardTaskList } from '@/components/rewards/RewardTaskList';
import { Avatar } from '@/components/shared/Avatar';
import { ExternalShareButton } from '@/components/shared/ExternalShareButton';
import { PageContainer } from '@/components/shared/PageContainer';
import { Separator } from '@/components/shared/Separator';
import { ShareEarnModal } from '@/components/shared/ShareEarnModal';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

interface ReferredUser {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
  reputationPoints: number;
  isFollowing: boolean;
  joinedAt: Date | null;
}

interface ReferralStats {
  totalReferrals: number;
  totalPointsEarned?: number;
  totalFeesEarned?: number;
  pointsPerReferral?: number;
  feeShareRate?: number;
  followingCount: number;
  weeklyReferralCount?: number;
  weeklyLimit?: number;
}

interface ReferralData {
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    bio: string | null;
    profileImageUrl: string | null;
    referralCode: string | null;
    reputationPoints: number;
    totalPoints: number;
    pointsAwardedForProfile: boolean;
    pointsAwardedForFarcaster: boolean;
    pointsAwardedForTwitter: boolean;
    pointsAwardedForWallet: boolean;
    farcasterUsername: string | null;
    twitterUsername: string | null;
    walletAddress: string | null;
  };
  stats: ReferralStats;
  referredUsers: ReferredUser[];
  referralUrl: string | null;
}

export default function RewardsPage() {
  const router = useRouter();
  const { ready, authenticated, getAccessToken, login, refresh } = useAuth();
  const { user } = useAuthStore();

  // Auth required — redirect to feed and show login
  useEffect(() => {
    if (!ready || authenticated) return;
    router.push('/feed');
    const timer = setTimeout(() => login(), 500);
    return () => clearTimeout(timer);
  }, [ready, authenticated, router, login]);
  const searchParams = useSearchParams();
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showLinkSocialModal, setShowLinkSocialModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Handle OAuth callback from Twitter/Discord linking
  useEffect(() => {
    const success = searchParams.get('success');
    const points = searchParams.get('points');
    const errorParam = searchParams.get('error');

    if (success === 'twitter_linked' && points) {
      toast.success(`X account linked! +${points} points awarded`);
      // Dispatch event to notify other components (like UserMenu) to refresh
      window.dispatchEvent(new CustomEvent('rewards-updated'));
      // Refresh auth state to get latest reputation points
      refresh();
      // Clean up URL params
      window.history.replaceState({}, '', '/rewards');
    } else if (success === 'discord_linked' && points) {
      toast.success(`Discord account linked! +${points} points awarded`);
      window.dispatchEvent(new CustomEvent('rewards-updated'));
      refresh();
      window.history.replaceState({}, '', '/rewards');
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        twitter_already_linked:
          'This X account is already linked to another user',
        discord_already_linked:
          'This Discord account is already linked to another user',
        token_exchange_failed: 'Failed to authenticate. Please try again.',
        invalid_state: 'Session expired. Please try again.',
        state_expired: 'Session expired. Please try again.',
      };
      toast.error(
        errorMessages[errorParam] || 'An error occurred. Please try again.'
      );
      window.history.replaceState({}, '', '/rewards');
    }
  }, [searchParams, refresh]);

  const fetchReferralData = useCallback(async () => {
    if (!user?.id || !authenticated) return;

    setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      console.error('Failed to get access token');
      setError('Authentication required');
      setLoading(false);
      return;
    }

    const response = await fetch(
      `/api/users/${encodeURIComponent(user.id)}/referrals`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      setLoading(false);
      setError('Failed to fetch referral data');
      return;
    }

    const data = await response.json();
    setReferralData(data);
    setLoading(false);
  }, [user?.id, authenticated, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated && user?.id) {
      fetchReferralData();
    } else if (ready && !authenticated) {
      setLoading(false);
    }
  }, [user?.id, ready, authenticated, fetchReferralData]);

  const handleCopyUrl = async () => {
    if (!referralData?.user.referralCode) return;
    const referralUrl = getReferralUrl(referralData.user.referralCode);
    const success = await navigator.clipboard
      .writeText(referralUrl)
      .then(() => true)
      .catch(() => false);
    if (success) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      toast.error('Failed to copy referral link');
    }
  };

  // Calculate total points earned from all sources
  const calculateTotalEarned = () => {
    if (!referralData) return 0;
    let total = 0;

    // Add referral fees earned (new system)
    if (referralData.stats.totalFeesEarned) {
      total += referralData.stats.totalFeesEarned;
    }

    // Add profile completion points
    if (referralData.user.pointsAwardedForProfile)
      total += POINTS.PROFILE_COMPLETION;
    if (referralData.user.pointsAwardedForFarcaster)
      total += POINTS.FARCASTER_LINK;
    if (referralData.user.pointsAwardedForTwitter) total += POINTS.TWITTER_LINK;
    if (referralData.user.pointsAwardedForWallet)
      total += POINTS.WALLET_CONNECT;

    return total;
  };

  const rewardTasks = referralData
    ? [
        {
          id: 'profile',
          title: 'Complete Profile',
          description: (() => {
            if (referralData.user.pointsAwardedForProfile) {
              return 'Username, image, and bio complete!';
            }
            const missing = [];
            if (!referralData.user.username) missing.push('username');
            if (!referralData.user.profileImageUrl) missing.push('image');
            if (!referralData.user.bio || referralData.user.bio.length < 50)
              missing.push('bio (50+ chars)');
            return `Set ${missing.join(', ')}`;
          })(),
          points: POINTS.PROFILE_COMPLETION,
          completed: referralData.user.pointsAwardedForProfile,
          action: 'profile-settings',
        },
        {
          id: 'twitter',
          title: 'Link X Account',
          description: referralData.user.twitterUsername
            ? `@${referralData.user.twitterUsername}`
            : 'Connect your X account',
          points: POINTS.TWITTER_LINK,
          completed: referralData.user.pointsAwardedForTwitter,
          action: 'link-social',
        },
        {
          id: 'farcaster',
          title: 'Link Farcaster',
          description: referralData.user.farcasterUsername
            ? `@${referralData.user.farcasterUsername}`
            : 'Connect Farcaster account',
          points: POINTS.FARCASTER_LINK,
          completed: referralData.user.pointsAwardedForFarcaster,
          action: 'link-social',
        },
        {
          id: 'wallet',
          title: 'Connect Wallet',
          description: referralData.user.walletAddress
            ? `${referralData.user.walletAddress.slice(0, 6)}...${referralData.user.walletAddress.slice(-4)}`
            : 'Link your wallet',
          points: POINTS.WALLET_CONNECT,
          completed: referralData.user.pointsAwardedForWallet,
          action: 'wallet-connect',
        },
      ]
    : [];

  const handleTaskClick = (_taskId: string, action: string) => {
    if (action === 'link-social') {
      setShowLinkSocialModal(true);
    } else if (action === 'profile-settings') {
      window.location.href = '/settings';
    } else if (action === 'wallet-connect') {
      // Trigger Privy login modal for wallet connection
      if (authenticated) {
        // If already authenticated, redirect to settings to connect wallet
        window.location.href = '/settings';
      } else {
        // Trigger login modal
        login();
      }
    }
  };

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Auth required — handled by redirect effect above */}

      {/* Loading State */}
      {authenticated && loading && <RewardsSkeleton />}

      {/* Error State */}
      {authenticated && error && !loading && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center text-red-500">
            <p className="mb-2 font-semibold text-lg">Failed to load rewards</p>
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Rewards Content - Desktop */}
      {authenticated && !loading && !error && referralData && (
        <div className="hidden flex-1 overflow-hidden xl:flex">
          {/* Main Content Column */}
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            {/* Header */}
            <div className="mb-4">
              <h1 className="mb-2 font-bold text-2xl text-foreground">
                Rewards
              </h1>
              <p className="text-muted-foreground">
                Complete tasks and invite friends to earn points
              </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-muted-foreground text-sm">
                  Total Earned
                </div>
                <div className="font-bold text-2xl text-foreground">
                  {calculateTotalEarned().toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground text-sm">
                  Total Points
                </div>
                <div className="font-bold text-2xl text-foreground">
                  {referralData.user.totalPoints.toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground text-sm">Referrals</div>
                <div className="font-bold text-2xl text-foreground">
                  {referralData.stats.totalReferrals}
                  {referralData.stats.weeklyReferralCount !== undefined &&
                    referralData.stats.weeklyLimit !== undefined && (
                      <span className="ml-1 font-normal text-muted-foreground text-sm">
                        ({referralData.stats.weeklyReferralCount}/
                        {referralData.stats.weeklyLimit} this week)
                      </span>
                    )}
                </div>
              </div>
            </div>

            {/* Daily Rewards */}
            <DailyStreakCard />

            {/* Referral Link */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-semibold text-foreground">Referral Link</h2>
                <span className="text-muted-foreground text-sm">
                  +{POINTS.REFERRAL_SIGNUP} points per signup (max 10/week)
                </span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 text-foreground text-sm">
                  {referralData.user.referralCode
                    ? getReferralUrl(referralData.user.referralCode)
                    : 'Generating your referral link...'}
                </div>
                <button
                  onClick={handleCopyUrl}
                  disabled={!referralData.user.referralCode}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span className="text-sm">Copy</span>
                    </>
                  )}
                </button>
              </div>
              {referralData.user.referralCode && (
                <div className="mt-2">
                  <ExternalShareButton
                    contentType="referral"
                    text={getReferralShareText(referralData.user.referralCode)}
                    url={getReferralUrl(referralData.user.referralCode)}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* One-Time Tasks */}
            <div>
              <h2 className="mb-3 font-semibold text-foreground">
                Earn Points
              </h2>
              <RewardTaskList
                tasks={rewardTasks}
                onTaskClick={handleTaskClick}
                variant="desktop"
              />
            </div>

            {/* Share & Earn */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Share & Earn</h2>
                <p className="text-muted-foreground text-sm">
                  Share content to earn +{POINTS.SHARE_ACTION} points (one-time)
                </p>
              </div>
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-[#0066FF]/90"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>

            {/* Referred Users List */}
            {referralData.referredUsers.length > 0 && (
              <div>
                <h2 className="mb-3 font-semibold text-foreground">
                  Your Referrals
                </h2>
                <div className="space-y-2">
                  {referralData.referredUsers.map((referredUser) => (
                    <div
                      key={referredUser.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                    >
                      <Avatar
                        id={referredUser.id}
                        name={
                          referredUser.displayName ||
                          referredUser.username ||
                          'User'
                        }
                        src={referredUser.profileImageUrl || undefined}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground text-sm">
                          {referredUser.displayName ||
                            referredUser.username ||
                            'Anonymous'}
                        </span>
                        {referredUser.username && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            @{referredUser.username}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(
                          referredUser.joinedAt || referredUser.createdAt
                        ).toLocaleDateString()}
                      </span>
                      <a
                        href={getProfileUrl(
                          referredUser.id,
                          referredUser.username
                        )}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="View profile"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rewards Widget Column */}
          {/* <div className="hidden xl:flex flex-col w-96 shrink-0 overflow-y-auto bg-sidebar p-4">
            {user && <RewardsWidget userId={user.id} />}
          </div> */}
        </div>
      )}

      {/* Mobile/Tablet View */}
      {authenticated && !loading && !error && referralData && (
        <div className="flex w-full flex-1 flex-col overflow-y-auto xl:hidden">
          <div className="w-full space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
            {/* Header */}
            <div>
              <h1 className="mb-2 font-bold text-2xl text-foreground">
                Rewards
              </h1>
              <p className="text-muted-foreground">
                Complete tasks and invite friends to earn points
              </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-muted-foreground text-xs">Earned</div>
                <div className="font-bold text-foreground text-xl">
                  {calculateTotalEarned().toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Total</div>
                <div className="font-bold text-foreground text-xl">
                  {referralData.user.totalPoints.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Referrals</div>
                <div className="font-bold text-foreground text-xl">
                  {referralData.stats.totalReferrals}
                </div>
              </div>
            </div>

            {/* Daily Rewards */}
            <DailyStreakCard />

            {/* Referral Link */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-semibold text-foreground">Referral Link</h2>
                <span className="text-muted-foreground text-xs">
                  +{POINTS.REFERRAL_SIGNUP}/signup
                </span>
              </div>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 text-foreground text-sm">
                  {referralData.user.referralCode
                    ? getReferralUrl(referralData.user.referralCode)
                    : 'Generating...'}
                </div>
                <button
                  onClick={handleCopyUrl}
                  disabled={!referralData.user.referralCode}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copiedUrl ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              {referralData.user.referralCode && (
                <div className="mt-2">
                  <ExternalShareButton
                    contentType="referral"
                    text={getReferralShareText(referralData.user.referralCode)}
                    url={getReferralUrl(referralData.user.referralCode)}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* One-Time Tasks */}
            <div>
              <h2 className="mb-3 font-semibold text-foreground">
                Earn Points
              </h2>
              <RewardTaskList
                tasks={rewardTasks}
                onTaskClick={handleTaskClick}
                variant="mobile"
              />
            </div>

            {/* Share & Earn */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Share & Earn</h2>
                <p className="text-muted-foreground text-sm">
                  +{POINTS.SHARE_ACTION} points (one-time)
                </p>
              </div>
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-[#0066FF]/90"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>

            {/* Referred Users List */}
            {referralData.referredUsers.length > 0 && (
              <div>
                <h2 className="mb-3 font-semibold text-foreground">
                  Your Referrals
                </h2>
                <div className="space-y-2">
                  {referralData.referredUsers.map((referredUser) => (
                    <div
                      key={referredUser.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                    >
                      <Avatar
                        id={referredUser.id}
                        name={
                          referredUser.displayName ||
                          referredUser.username ||
                          'User'
                        }
                        src={referredUser.profileImageUrl || undefined}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground text-sm">
                          {referredUser.displayName ||
                            referredUser.username ||
                            'Anonymous'}
                        </span>
                        {referredUser.username && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            @{referredUser.username}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(
                          referredUser.joinedAt || referredUser.createdAt
                        ).toLocaleDateString()}
                      </span>
                      <a
                        href={getProfileUrl(
                          referredUser.id,
                          referredUser.username
                        )}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="View profile"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link Social Accounts Modal */}
      <LinkSocialAccountsModal
        isOpen={showLinkSocialModal}
        onClose={() => {
          setShowLinkSocialModal(false);
          // Refresh data to update the UI
          if (user?.id && authenticated) {
            fetchReferralData();
          }
        }}
      />

      {/* Share & Earn Modal */}
      <ShareEarnModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        contentType="profile"
        contentId={user?.id || ''}
        text="Check out my Babylon profile! 🎮"
      />
    </PageContainer>
  );
}
