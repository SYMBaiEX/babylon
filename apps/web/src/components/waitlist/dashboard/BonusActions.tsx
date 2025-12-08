'use client';

import { POINTS } from '@babylon/shared';
import { Check, Link2, User, Users, Wallet, X } from 'lucide-react';

interface BonusActionsProps {
  dbUser: {
    profileComplete?: boolean;
    hasTwitter?: boolean;
    hasDiscord?: boolean;
    hasFarcaster?: boolean;
  } | null;
  privyUser: {
    wallet?: { address?: string };
  } | null;
  // Twitter state
  hasTwitterFollow: boolean;
  showVerifyTwitterFollowButton: boolean;
  isVerifyingTwitterFollow: boolean;
  // Discord state
  hasDiscordJoin: boolean;
  showVerifyDiscordJoinButton: boolean;
  isVerifyingDiscordJoin: boolean;
  // Farcaster state
  hasFarcasterFollow: boolean;
  showVerifyFollowButton: boolean;
  isVerifyingFollow: boolean;
  // Handlers
  onOpenProfileModal: () => void;
  onTwitterOAuth: () => void;
  onTwitterFollow: () => void;
  onVerifyTwitterFollow: () => void;
  onHideVerifyTwitterFollow: () => void;
  onDiscordOAuth: () => void;
  onDiscordJoin: () => void;
  onVerifyDiscordJoin: () => void;
  onHideVerifyDiscordJoin: () => void;
  onFarcasterOAuth: () => void;
  onFarcasterFollow: () => void;
  onVerifyFarcasterFollow: () => void;
  onHideVerifyFarcasterFollow: () => void;
  onWalletConnect: () => void;
}

/**
 * Bonus actions section for earning additional points.
 */
export function BonusActions({
  dbUser,
  privyUser,
  hasTwitterFollow,
  showVerifyTwitterFollowButton,
  isVerifyingTwitterFollow,
  hasDiscordJoin,
  showVerifyDiscordJoinButton,
  isVerifyingDiscordJoin,
  hasFarcasterFollow,
  showVerifyFollowButton,
  isVerifyingFollow,
  onOpenProfileModal,
  onTwitterOAuth,
  onTwitterFollow,
  onVerifyTwitterFollow,
  onHideVerifyTwitterFollow,
  onDiscordOAuth,
  onDiscordJoin,
  onVerifyDiscordJoin,
  onHideVerifyDiscordJoin,
  onFarcasterOAuth,
  onFarcasterFollow,
  onVerifyFarcasterFollow,
  onHideVerifyFarcasterFollow,
  onWalletConnect,
}: BonusActionsProps) {
  const isProfileComplete = dbUser?.profileComplete;

  return (
    <div className="rounded-xl border border-primary/10 bg-primary/5 p-5 backdrop-blur-sm sm:p-6">
      <h3 className="mb-4 font-semibold text-lg">Earn More Points</h3>
      <div className="space-y-3">
        {/* Profile Completion */}
        {!isProfileComplete ? (
          <button
            type="button"
            onClick={onOpenProfileModal}
            className="flex min-h-[48px] w-full cursor-pointer touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] sm:p-4"
          >
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Complete Profile</span>
            </div>
            <span className="font-bold text-primary text-sm">
              +{POINTS.PROFILE_COMPLETION}
            </span>
          </button>
        ) : (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Profile Complete</span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.PROFILE_COMPLETION}
            </span>
          </div>
        )}

        {/* Twitter/X Link */}
        {!dbUser?.hasTwitter && (
          <button
            type="button"
            onClick={onTwitterOAuth}
            className="flex min-h-[48px] w-full cursor-pointer touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Link2 className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Link X Account</span>
            </div>
            <span className="font-bold text-primary text-sm">
              +{POINTS.TWITTER_LINK}
            </span>
          </button>
        )}
        {dbUser?.hasTwitter && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">X Account Linked</span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.TWITTER_LINK}
            </span>
          </div>
        )}

        {/* Follow Babylon on Twitter/X */}
        {!hasTwitterFollow && !showVerifyTwitterFollowButton && (
          <button
            type="button"
            onClick={onTwitterFollow}
            disabled={!dbUser?.hasTwitter}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">
                Follow @PlayBabylon on X
              </span>
            </div>
            <span className="ml-2 font-bold text-primary text-sm">
              +{POINTS.TWITTER_FOLLOW}
            </span>
          </button>
        )}

        {/* Verify Twitter Follow Section */}
        {showVerifyTwitterFollowButton && !hasTwitterFollow && (
          <div className="w-full space-y-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onVerifyTwitterFollow}
                  disabled={isVerifyingTwitterFollow}
                  className="flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg bg-primary p-3 font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span className="text-sm">
                    {isVerifyingTwitterFollow
                      ? 'Processing...'
                      : 'Claim Reward'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onHideVerifyTwitterFollow}
                  disabled={isVerifyingTwitterFollow}
                  className="touch-manipulation rounded-lg border border-border bg-background/50 px-4 transition-all duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {hasTwitterFollow && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">
                Following @PlayBabylon
              </span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.TWITTER_FOLLOW}
            </span>
          </div>
        )}

        {/* Link Discord */}
        {!dbUser?.hasDiscord && (
          <button
            type="button"
            onClick={onDiscordOAuth}
            className="flex min-h-[48px] w-full cursor-pointer touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Link2 className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Link Discord</span>
            </div>
            <span className="font-bold text-primary text-sm">
              +{POINTS.DISCORD_LINK}
            </span>
          </button>
        )}
        {dbUser?.hasDiscord && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Discord Linked</span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.DISCORD_LINK}
            </span>
          </div>
        )}

        {/* Join Discord */}
        {!hasDiscordJoin && !showVerifyDiscordJoinButton && (
          <button
            type="button"
            onClick={onDiscordJoin}
            disabled={!dbUser?.hasDiscord}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background/50 sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">
                Join Babylon Discord
              </span>
            </div>
            <span className="ml-2 font-bold text-primary text-sm">
              +{POINTS.DISCORD_JOIN}
            </span>
          </button>
        )}

        {/* Verify Discord Join Section */}
        {showVerifyDiscordJoinButton && !hasDiscordJoin && (
          <div className="w-full space-y-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onVerifyDiscordJoin}
                  disabled={isVerifyingDiscordJoin}
                  className="flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg bg-primary p-3 font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span className="text-sm">
                    {isVerifyingDiscordJoin ? 'Verifying...' : 'Verify Join'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onHideVerifyDiscordJoin}
                  disabled={isVerifyingDiscordJoin}
                  className="touch-manipulation rounded-lg border border-border bg-background/50 px-4 transition-all duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {hasDiscordJoin && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">
                Joined Babylon Discord
              </span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.DISCORD_JOIN}
            </span>
          </div>
        )}

        {/* Farcaster Link */}
        {!dbUser?.hasFarcaster && (
          <button
            type="button"
            onClick={onFarcasterOAuth}
            className="flex min-h-[48px] w-full cursor-pointer touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Link2 className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Link Farcaster</span>
            </div>
            <span className="font-bold text-primary text-sm">
              +{POINTS.FARCASTER_LINK}
            </span>
          </button>
        )}
        {dbUser?.hasFarcaster && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Farcaster Linked</span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.FARCASTER_LINK}
            </span>
          </div>
        )}

        {/* Follow Babylon on Farcaster */}
        {!hasFarcasterFollow && !showVerifyFollowButton && (
          <button
            type="button"
            onClick={onFarcasterFollow}
            disabled={!dbUser?.hasFarcaster}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">
                Follow @playbabylon on Farcaster
              </span>
            </div>
            <span className="ml-2 font-bold text-primary text-sm">
              +{POINTS.FARCASTER_FOLLOW}
            </span>
          </button>
        )}

        {/* Verify Farcaster Follow Section */}
        {showVerifyFollowButton && !hasFarcasterFollow && (
          <div className="w-full space-y-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onVerifyFarcasterFollow}
                  disabled={isVerifyingFollow}
                  className="flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg bg-primary p-3 font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span className="text-sm">
                    {isVerifyingFollow ? 'Verifying...' : 'Verify Follow'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onHideVerifyFarcasterFollow}
                  disabled={isVerifyingFollow}
                  className="touch-manipulation rounded-lg border border-border bg-background/50 px-4 transition-all duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {hasFarcasterFollow && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">
                Following @playbabylon
              </span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.FARCASTER_FOLLOW}
            </span>
          </div>
        )}

        {/* Wallet Connect */}
        {!privyUser?.wallet?.address && (
          <button
            onClick={onWalletConnect}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-between rounded-lg border border-border bg-background/50 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background active:scale-[0.98] sm:p-4"
          >
            <div className="flex items-center gap-3">
              <Wallet className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Connect Wallet</span>
            </div>
            <span className="font-bold text-primary text-sm">
              +{POINTS.WALLET_CONNECT}
            </span>
          </button>
        )}
        {privyUser?.wallet?.address && (
          <div className="flex w-full items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-green-500 sm:h-5 sm:w-5" />
              <span className="font-semibold text-sm">Wallet Connected</span>
            </div>
            <span className="font-bold text-green-500 text-sm">
              +{POINTS.WALLET_CONNECT}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
