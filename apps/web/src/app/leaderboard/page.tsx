'use client';

import { getProfileUrl } from '@babylon/shared';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Trophy,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FollowButton } from '@/components/interactions/FollowButton';
import type { SelectedUser } from '@/components/leaderboard/LeaderboardWidgetSidebar';
import { OnChainBadge } from '@/components/profile/OnChainBadge';
import { Avatar } from '@/components/shared/Avatar';
import type { LeaderboardTab } from '@/components/shared/LeaderboardToggle';
import { LeaderboardToggle } from '@/components/shared/LeaderboardToggle';
import { PageContainer } from '@/components/shared/PageContainer';
import { RankNumber } from '@/components/shared/RankBadge';
import { LeaderboardSkeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';

const LeaderboardWidgetSidebar = dynamic(
  () =>
    import('@/components/leaderboard/LeaderboardWidgetSidebar').then((m) => ({
      default: m.LeaderboardWidgetSidebar,
    })),
  {
    ssr: false,
    loading: () => <div className="hidden w-96 flex-none xl:block" />,
  }
);

interface LeaderboardUser {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  totalPoints: number;
  balance: number;
  lifetimePnL: number;
  createdAt: Date;
  rank: number;
  isAgent?: boolean;
  managedBy?: string | null;
  onChainRegistered?: boolean;
  nftTokenId?: number | null;
  teamTotalPoints?: number;
  agentCount?: number;
  userPoints?: number;
  agentPoints?: number;
}

interface CurrentUserPosition {
  rank: number;
  page: number;
  entry: LeaderboardUser;
}

interface LeaderboardData {
  leaderboard: LeaderboardUser[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  leaderboardType: LeaderboardTab;
  currentUser: CurrentUserPosition | null;
}

export default function LeaderboardPage() {
  const { authenticated, user } = useAuth();
  const [leaderboardData, setLeaderboardData] =
    useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState<LeaderboardTab>('wallet');
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const scrollToUserRef = useRef(false);

  const pageSize = 100;

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true);
      setError(null);

      let url = `/api/leaderboard?type=${selectedTab}&page=${currentPage}&pageSize=${pageSize}`;
      if (authenticated && user) {
        url += `&userId=${user.id}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        setError('Failed to fetch leaderboard');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setLeaderboardData(data);
      setLoading(false);
    }

    fetchLeaderboard();
  }, [currentPage, selectedTab, authenticated, user]);

  useEffect(() => {
    if (scrollToUserRef.current && !loading) {
      scrollToUserRef.current = false;
      setTimeout(() => {
        document
          .querySelector('[data-current-user="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [loading]);

  const handleTabChange = (tab: LeaderboardTab) => {
    if (tab === selectedTab) return;
    setSelectedTab(tab);
    setCurrentPage(1);
    setSelectedUser(null);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (
      leaderboardData &&
      currentPage < leaderboardData.pagination.totalPages
    ) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToPosition = () => {
    if (leaderboardData?.currentUser) {
      setCurrentPage(leaderboardData.currentUser.page);
      scrollToUserRef.current = true;
    }
  };

  const handleUserClick = (player: LeaderboardUser) => {
    setSelectedUser({
      id: player.id,
      username: player.username,
      displayName: player.displayName,
      profileImageUrl: player.profileImageUrl,
      totalPoints: player.totalPoints,
      balance: player.balance,
      lifetimePnL: player.lifetimePnL,
      rank: player.rank,
      isAgent: player.isAgent,
      managedBy: player.managedBy,
      onChainRegistered: player.onChainRegistered,
      nftTokenId: player.nftTokenId,
      teamTotalPoints: player.teamTotalPoints,
      agentCount: player.agentCount,
      userPoints: player.userPoints,
      agentPoints: player.agentPoints,
    });
  };

  const isTeamView = selectedTab === 'team';
  const currentUserPosition = leaderboardData?.currentUser ?? null;
  const currentUserRowId =
    authenticated && user
      ? isTeamView && currentUserPosition
        ? currentUserPosition.entry.id
        : user.id
      : null;
  const isCurrentUserOnPage = currentUserRowId
    ? leaderboardData?.leaderboard.some((p) => p.id === currentUserRowId)
    : false;

  const tabDescriptions: Record<LeaderboardTab, string> = {
    wallet:
      'Individual wallets ranked by total points (balance + positions + reputation)',
    team: 'Users + their AI agents combined, ranked by team total',
  };

  const getDisplayPoints = (player: LeaderboardUser): number => {
    if (isTeamView && player.teamTotalPoints !== undefined) {
      return player.teamTotalPoints;
    }
    return player.totalPoints;
  };

  const getPointsLabel = (): string => {
    return isTeamView ? 'Team Points' : 'Total Points';
  };

  const renderPlayerRow = (
    player: LeaderboardUser,
    variant: 'desktop' | 'mobile' | 'pinned'
  ) => {
    const isCurrentUser = currentUserRowId
      ? player.id === currentUserRowId
      : false;
    const displayPoints = getDisplayPoints(player);
    const formattedPoints = (displayPoints ?? 0).toLocaleString();
    const isPinned = variant === 'pinned';

    const content = (
      <div
        className={`flex items-center ${variant === 'mobile' ? 'gap-2 sm:gap-4' : 'gap-4'}`}
      >
        <div className="shrink-0">
          <RankNumber rank={player.rank} size="md" />
        </div>
        <div className="relative shrink-0">
          <Avatar
            id={player.id}
            name={player.displayName || player.username || 'User'}
            size="md"
            src={player.profileImageUrl || undefined}
          />
          {authenticated && !isCurrentUser && !isPinned && (
            <div
              className={`-bottom-0.5 -right-1 absolute ${variant === 'mobile' ? '' : ''}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <FollowButton userId={player.id} variant="circle" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3
              className={`truncate font-semibold text-foreground ${variant === 'mobile' ? 'text-sm sm:text-base' : ''}`}
            >
              {player.displayName || player.username || 'Anonymous'}
            </h3>
            {player.isAgent ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-500 text-xs">
                <Bot className="h-3 w-3" />
                AI
              </span>
            ) : (
              <OnChainBadge
                isRegistered={player.onChainRegistered ?? false}
                nftTokenId={player.nftTokenId ?? null}
                size="sm"
              />
            )}
            {(isCurrentUser || isPinned) && (
              <span className="shrink-0 rounded bg-foreground px-2 py-0.5 font-semibold text-background text-xs">
                YOU
              </span>
            )}
          </div>
          {variant !== 'mobile' && player.username && (
            <p className="truncate text-muted-foreground text-sm">
              @{player.username}
            </p>
          )}
          {variant === 'mobile' && (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="font-bold text-foreground">
                {formattedPoints} pts
              </span>
              {isTeamView &&
                player.agentCount !== undefined &&
                player.agentCount > 0 && (
                  <span className="text-muted-foreground">
                    {player.agentCount}{' '}
                    {player.agentCount === 1 ? 'agent' : 'agents'}
                  </span>
                )}
            </div>
          )}
        </div>
        {variant !== 'mobile' && (
          <div className="shrink-0 text-right">
            <div className="font-bold text-foreground text-lg">
              {formattedPoints}
            </div>
            <div className="text-muted-foreground text-xs">
              {getPointsLabel()}
              {isTeamView &&
                player.agentCount !== undefined &&
                player.agentCount > 0 &&
                ` (${player.agentCount} ${player.agentCount === 1 ? 'agent' : 'agents'})`}
            </div>
          </div>
        )}
      </div>
    );

    return content;
  };

  const renderEmptyState = () => {
    if (!leaderboardData) return null;
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <Trophy className="mx-auto mb-4 h-16 w-16 opacity-50" />
          <p className="mb-2 font-semibold text-foreground text-lg">
            No Results Yet
          </p>
          <p className="text-sm">
            {isTeamView
              ? 'No teams have points yet. Start trading to appear here!'
              : 'No wallets have points yet. Start trading to appear here!'}
          </p>
        </div>
      </div>
    );
  };

  const renderLeaderboardContent = () => {
    if (loading) {
      return (
        <div className="flex-1 overflow-y-auto p-4">
          <LeaderboardSkeleton count={15} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="mb-2 font-semibold text-foreground text-lg">
              Failed to load leaderboard
            </p>
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        </div>
      );
    }

    if (!leaderboardData || leaderboardData.leaderboard.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-0">
          {leaderboardData.leaderboard.map((player) => {
            const isCurrentUser = currentUserRowId
              ? player.id === currentUserRowId
              : false;
            const isPlayerSelected = selectedUser?.id === player.id;

            return (
              <div key={player.id} className="flex items-stretch">
                {/* Desktop: clickable for sidebar widget */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`View profile for ${player.displayName || player.username || 'Anonymous'}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleUserClick(player);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUserClick(player);
                    }
                  }}
                  data-current-user={isCurrentUser ? 'true' : undefined}
                  className={`hidden flex-1 cursor-pointer px-4 py-3 text-left transition-colors xl:block ${
                    isPlayerSelected
                      ? 'border-l-4 border-l-foreground bg-muted/30'
                      : isCurrentUser
                        ? 'border-l-4 border-l-foreground bg-muted/20 hover:bg-muted/30'
                        : 'border-l-4 border-l-transparent hover:bg-muted/30'
                  }`}
                >
                  {renderPlayerRow(player, 'desktop')}
                </div>

                {/* Mobile/Tablet: direct link to profile */}
                <Link
                  href={getProfileUrl(player.id, player.username) || '#'}
                  data-current-user={isCurrentUser ? 'true' : undefined}
                  className={`block flex-1 px-4 py-1.5 transition-colors xl:hidden ${
                    isCurrentUser
                      ? 'border-l-4 border-l-foreground bg-muted/20'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  {renderPlayerRow(player, 'mobile')}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Pinned current user row (when not on current page) */}
        {authenticated && currentUserPosition && !isCurrentUserOnPage && (
          <div className="sticky bottom-14 border-border border-t bg-muted/40 px-4 py-3 backdrop-blur-sm">
            <div className="mb-1 text-muted-foreground text-xs">
              Your position
            </div>
            {renderPlayerRow(currentUserPosition.entry, 'pinned')}
          </div>
        )}

        {/* Pagination */}
        {leaderboardData.pagination.totalPages > 1 && (
          <div className="sticky bottom-0 bg-background/95 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-4 py-3 text-foreground transition-colors hover:bg-sidebar-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <div className="text-muted-foreground text-sm">
                Page {currentPage} of {leaderboardData.pagination.totalPages}
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === leaderboardData.pagination.totalPages}
                className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-4 py-3 text-foreground transition-colors hover:bg-sidebar-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageContainer noPadding className="overflow-visible! flex w-full flex-col">
      {/* Desktop: Content + Widgets layout */}
      <div className="hidden flex-1 overflow-hidden xl:flex">
        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-border lg:border-r lg:border-l">
          {/* Header with tabs */}
          <div className="sticky top-0 z-10 shrink-0 bg-background shadow-sm">
            <LeaderboardToggle
              activeTab={selectedTab}
              onTabChange={handleTabChange}
            />
            <div className="flex items-center justify-between px-3 py-3 sm:px-4 lg:px-6">
              <p className="text-muted-foreground text-sm">
                {tabDescriptions[selectedTab]}
              </p>
              {authenticated && currentUserPosition && (
                <button
                  onClick={handleJumpToPosition}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-primary/20"
                >
                  <Crosshair className="h-3.5 w-3.5" />#
                  {currentUserPosition.rank.toLocaleString()}
                </button>
              )}
            </div>
          </div>

          {renderLeaderboardContent()}
        </div>

        {/* Widget Sidebar */}
        <LeaderboardWidgetSidebar
          selectedUser={selectedUser}
          leaderboardType={selectedTab}
        />
      </div>

      {/* Mobile/Tablet: Full width content */}
      <div className="flex flex-1 flex-col overflow-hidden xl:hidden">
        {/* Header with tabs */}
        <div className="sticky top-0 z-10 shrink-0 bg-background shadow-sm">
          <LeaderboardToggle
            activeTab={selectedTab}
            onTabChange={handleTabChange}
          />
          <div className="flex items-center justify-between px-3 py-2 sm:px-4">
            <p className="text-muted-foreground text-xs sm:text-sm">
              {tabDescriptions[selectedTab]}
            </p>
            {authenticated && currentUserPosition && (
              <button
                onClick={handleJumpToPosition}
                className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary text-xs transition-colors hover:bg-primary/20"
              >
                <Crosshair className="h-3 w-3" />#
                {currentUserPosition.rank.toLocaleString()}
              </button>
            )}
          </div>
        </div>

        {renderLeaderboardContent()}
      </div>
    </PageContainer>
  );
}
