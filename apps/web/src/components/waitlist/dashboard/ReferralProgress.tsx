'use client';

import { Users } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import type { ReferralUser, WaitlistData, ReferralTab } from '../types';

interface ReferralProgressProps {
  waitlistData: WaitlistData;
  referralTab: ReferralTab;
  onTabChange: (tab: ReferralTab) => void;
}

/**
 * Helper function to get the best display name for a referral user.
 */
function getReferralUserDisplayName(user: ReferralUser): string {
  if (user.displayName) return user.displayName;
  if (user.username) return user.username;
  if (user.farcasterUsername) return user.farcasterUsername;
  if (user.twitterUsername) return `@${user.twitterUsername}`;
  if (user.email) {
    const emailParts = user.email.split('@');
    const emailPrefix = emailParts[0] || user.email;
    return emailPrefix.length > 20
      ? `${emailPrefix.slice(0, 17)}...`
      : emailPrefix;
  }
  return 'Anonymous';
}

/**
 * Helper function to get subtitle/handle for a referral user.
 */
function getReferralUserSubtitle(user: ReferralUser): string | null {
  if (user.username && user.displayName) {
    return `@${user.username}`;
  }
  if (user.email && !user.username) {
    return user.email;
  }
  return null;
}

/**
 * Referral progress component with breakdown and user lists.
 */
export function ReferralProgress({
  waitlistData,
  referralTab,
  onTabChange,
}: ReferralProgressProps) {
  const hasReferrals =
    (waitlistData.invitedUsers && waitlistData.invitedUsers.length > 0) ||
    (waitlistData.qualifiedUsers && waitlistData.qualifiedUsers.length > 0);

  return (
    <div className="rounded-xl border border-primary/10 bg-primary/5 p-5 backdrop-blur-sm sm:p-6">
      <h3 className="mb-4 font-semibold text-lg">Referral Progress</h3>

      {/* Summary Stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {/* Invited (Pending) */}
        <div className="rounded-lg bg-background/20 p-4 text-center">
          <div className="mb-1 font-bold text-2xl text-yellow-500 sm:text-3xl">
            {waitlistData.invitedCount ?? 0}
          </div>
          <div className="text-muted-foreground text-sm">Invited</div>
          <div className="mt-1 text-muted-foreground/70 text-xs">Pending</div>
        </div>

        {/* Qualified (Completed) */}
        <div className="rounded-lg bg-background/20 p-4 text-center">
          <div className="mb-1 font-bold text-2xl text-green-500 sm:text-3xl">
            {waitlistData.qualifiedCount ?? 0}
          </div>
          <div className="text-muted-foreground text-sm">Qualified</div>
          <div className="mt-1 text-muted-foreground/70 text-xs">Completed</div>
        </div>

        {/* Total Referral Points */}
        <div className="rounded-lg bg-background/20 p-4 text-center">
          <div className="mb-1 font-bold text-2xl text-primary sm:text-3xl">
            {(
              waitlistData.totalReferralPoints ??
              waitlistData.pointsBreakdown.invite
            ).toLocaleString()}
          </div>
          <div className="text-muted-foreground text-sm">Points</div>
          <div className="mt-1 text-muted-foreground/70 text-xs">
            From referrals
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      {hasReferrals && (
        <>
          <div className="mb-4 flex items-center gap-1 border-border/50 border-b">
            <button
              onClick={() => onTabChange('qualified')}
              className={`relative px-4 py-2 font-semibold text-sm transition-colors ${
                referralTab === 'qualified'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Qualified ({waitlistData.qualifiedCount ?? 0})
              {referralTab === 'qualified' && (
                <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-primary" />
              )}
            </button>

            <button
              onClick={() => onTabChange('pending')}
              className={`relative px-4 py-2 font-semibold text-sm transition-colors ${
                referralTab === 'pending'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pending ({waitlistData.invitedCount ?? 0})
              {referralTab === 'pending' && (
                <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {/* Referral User Lists */}
          <div className="max-h-56 space-y-2 overflow-y-auto transition-all duration-300 ease-in-out">
            {/* Pending Users Tab */}
            {referralTab === 'pending' && (
              <div className="fade-in flex animate-in flex-col gap-1 duration-300">
                {waitlistData.invitedUsers &&
                waitlistData.invitedUsers.length > 0 ? (
                  waitlistData.invitedUsers.map((user) => {
                    const displayName = getReferralUserDisplayName(user);
                    const subtitle = getReferralUserSubtitle(user);

                    return (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 transition-colors hover:bg-yellow-500/15"
                      >
                        <Avatar
                          id={user.id}
                          type="user"
                          src={user.profileImageUrl || undefined}
                          alt={displayName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-foreground text-sm">
                            {displayName}
                          </h3>
                          <p className="truncate text-muted-foreground text-xs">
                            {subtitle || `@${displayName}`}
                          </p>
                          <p className="mt-0.5 text-muted-foreground text-xs">
                            Signed up{' '}
                            {new Date(user.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="shrink-0 text-xs text-yellow-600 dark:text-yellow-400">
                          <span className="shrink-0 rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                            Pending
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No pending referrals yet
                  </div>
                )}
              </div>
            )}

            {/* Qualified Users Tab */}
            {referralTab === 'qualified' && (
              <div className="fade-in flex animate-in flex-col gap-1 duration-300">
                {waitlistData.qualifiedUsers &&
                waitlistData.qualifiedUsers.length > 0 ? (
                  waitlistData.qualifiedUsers.map((user) => {
                    const displayName = getReferralUserDisplayName(user);
                    const subtitle = getReferralUserSubtitle(user);

                    return (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                      >
                        <Avatar
                          id={user.id}
                          type="user"
                          src={user.profileImageUrl || undefined}
                          alt={displayName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-foreground text-sm">
                            {displayName}
                          </h3>
                          {subtitle && (
                            <p className="truncate text-muted-foreground text-xs">
                              {subtitle}
                            </p>
                          )}
                          <p className="mt-0.5 text-muted-foreground text-xs">
                            {new Date(
                              user.completedAt || user.createdAt
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No qualified referrals yet
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* No Referrals Yet */}
      {!hasReferrals && (
        <div className="rounded-lg border border-border/50 bg-background/20 py-8 text-center">
          <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="mb-1 font-semibold text-foreground text-sm">
            No referrals yet
          </h3>
          <p className="text-muted-foreground text-xs">
            Share your invite link to start earning points
          </p>
        </div>
      )}
    </div>
  );
}
