'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getUserDisplayName } from '@/lib/user-display';
import type { LeaderboardTab, TopUser, WaitlistData } from '../types';

interface LeaderboardProps {
  topUsers: TopUser[];
  waitlistData: WaitlistData;
  currentUserId: string;
  leaderboardPage: number;
  leaderboardTotalPages: number;
  leaderboardTab: LeaderboardTab;
  onPageChange: (page: number) => void;
  onTabChange: (tab: LeaderboardTab) => void;
  onUserClick: (userId: string) => void;
}

/**
 * Leaderboard component with pagination and tab support.
 */
export function Leaderboard({
  topUsers,
  waitlistData,
  currentUserId,
  leaderboardPage,
  leaderboardTotalPages,
  leaderboardTab,
  onPageChange,
  onTabChange,
  onUserClick,
}: LeaderboardProps) {
  if (topUsers.length === 0) {
    return null;
  }

  const currentUserInPage = topUsers.some((u) => u.id === currentUserId);

  return (
    <div className="lg:col-span-3">
      <div className="rounded-xl border border-primary/10 bg-primary/5 p-6 backdrop-blur-sm lg:p-8">
        {/* Tab Navigation */}
        <div className="mb-6 flex items-center gap-1 border-border/50 border-b">
          <button
            onClick={() => {
              onTabChange('leaderboard');
              onPageChange(1);
            }}
            className={`relative px-4 py-3 font-semibold text-sm transition-colors ${
              leaderboardTab === 'leaderboard'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Leaderboard
            {leaderboardTab === 'leaderboard' && (
              <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => {
              onTabChange('inviters');
              onPageChange(1);
            }}
            className={`relative px-4 py-3 font-semibold text-sm transition-colors ${
              leaderboardTab === 'inviters'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Top Inviters
            {leaderboardTab === 'inviters' && (
              <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-primary" />
            )}
          </button>
          <span className="ml-auto text-muted-foreground text-sm">Top 100</span>
        </div>

        {/* Leaderboard List */}
        <div className="mb-6 space-y-3">
          {topUsers.map((topUser) => {
            const isCurrentUser = topUser.id === currentUserId;
            return (
              <div
                key={topUser.id || `user-${topUser.rank}`}
                onClick={() => onUserClick(topUser.id)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors lg:p-5 ${
                  isCurrentUser
                    ? 'border-primary bg-primary/20 shadow-md'
                    : topUser.rank === 1
                      ? 'border-yellow-500/30 bg-yellow-500/10'
                      : topUser.rank === 2
                        ? 'border-gray-400/30 bg-gray-400/10'
                        : topUser.rank === 3
                          ? 'border-orange-500/30 bg-orange-500/10'
                          : 'border-border/50 bg-background/30 hover:bg-background/40'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div
                    className={`w-12 shrink-0 text-center font-bold text-lg lg:text-xl ${
                      topUser.rank === 1
                        ? 'text-yellow-500'
                        : topUser.rank === 2
                          ? 'text-gray-400'
                          : topUser.rank === 3
                            ? 'text-orange-500'
                            : 'text-muted-foreground'
                    }`}
                  >
                    #{topUser.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-semibold text-base lg:text-lg">
                      <span className="truncate">
                        {getUserDisplayName(topUser, 'Anonymous')}
                      </span>
                      {isCurrentUser && (
                        <span className="shrink-0 rounded bg-primary px-2 py-1 text-primary-foreground text-xs">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-muted-foreground text-sm">
                      {topUser.referralCount}{' '}
                      {topUser.referralCount === 1 ? 'referral' : 'referrals'}
                    </div>
                  </div>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <div className="font-bold text-lg text-primary lg:text-xl">
                    {(leaderboardTab === 'leaderboard'
                      ? topUser.reputationPoints
                      : topUser.invitePoints
                    ).toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {leaderboardTab === 'leaderboard' ? 'points' : 'invite pts'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Show current user if not on current page */}
        {!currentUserInPage &&
          waitlistData?.leaderboardRank &&
          waitlistData.leaderboardRank > 0 && (
            <div className="mb-6 border-border/50 border-t pt-4">
              <div className="flex items-center justify-between rounded-xl border border-primary bg-primary/20 p-4 shadow-md lg:p-5">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="w-12 shrink-0 text-center font-bold text-lg text-primary lg:text-xl">
                    #{waitlistData.leaderboardRank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold text-base lg:text-lg">
                      You
                      <span className="shrink-0 rounded bg-primary px-2 py-1 text-primary-foreground text-xs">
                        YOU
                      </span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground text-sm">
                      {waitlistData.referralCount}{' '}
                      {waitlistData.referralCount === 1
                        ? 'referral'
                        : 'referrals'}
                    </div>
                  </div>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <div className="font-bold text-lg text-primary lg:text-xl">
                    {(leaderboardTab === 'leaderboard'
                      ? (waitlistData.pointsBreakdown?.total ?? 0)
                      : (waitlistData.pointsBreakdown?.invite ?? 0)
                    ).toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {leaderboardTab === 'leaderboard' ? 'points' : 'invite pts'}
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Pagination Controls */}
        {leaderboardTotalPages > 1 && (
          <div className="flex items-center justify-between border-border/50 border-t pt-4">
            <button
              onClick={() => onPageChange(Math.max(1, leaderboardPage - 1))}
              disabled={leaderboardPage === 1}
              className="flex min-h-[44px] touch-manipulation items-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 font-semibold text-sm transition-all duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="font-medium text-muted-foreground text-sm">
              Page {leaderboardPage} of {leaderboardTotalPages}
            </div>
            <button
              onClick={() =>
                onPageChange(
                  Math.min(leaderboardTotalPages, leaderboardPage + 1)
                )
              }
              disabled={leaderboardPage >= leaderboardTotalPages}
              className="flex min-h-[44px] touch-manipulation items-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 font-semibold text-sm transition-all duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
