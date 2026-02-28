'use client';

import { formatCurrency, getProfileUrl } from '@babylon/shared';
import { Bot, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { FollowButton } from '@/components/interactions/FollowButton';
import { OnChainBadge } from '@/components/profile/OnChainBadge';
import { Avatar } from '@/components/shared/Avatar';
import type { LeaderboardTab } from '@/components/shared/LeaderboardToggle';
import { useAuth } from '@/hooks/useAuth';

export interface SelectedUser {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  totalPoints: number;
  balance: number;
  lifetimePnL: number;
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

interface LeaderboardWidgetSidebarProps {
  selectedUser: SelectedUser | null;
  leaderboardType: LeaderboardTab;
}

export function LeaderboardWidgetSidebar({
  selectedUser,
  leaderboardType,
}: LeaderboardWidgetSidebarProps) {
  const { authenticated, user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    if (window.innerWidth < 1280) return;

    let lastScrollTop = 0;
    let direction: 'up' | 'down' = 'down';
    let translateY = 0;
    let ticking = false;

    const updateSidebar = () => {
      const scrollTop = document.scrollingElement?.scrollTop || 0;
      const viewportHeight = window.innerHeight;
      const sidebarHeight = inner.offsetHeight;
      const containerTop = container.getBoundingClientRect().top;
      const bannerOffset = Math.max(0, containerTop);

      if (scrollTop > lastScrollTop) {
        direction = 'down';
      } else if (scrollTop < lastScrollTop) {
        direction = 'up';
      }
      lastScrollTop = scrollTop;

      const fitsInViewport = sidebarHeight <= viewportHeight - bannerOffset;

      if (fitsInViewport) {
        inner.style.position = 'fixed';
        inner.style.top = `${bannerOffset}px`;
        inner.style.transform = '';
      } else {
        const maxTranslate = sidebarHeight - (viewportHeight - bannerOffset);

        if (direction === 'down') {
          translateY = Math.min(scrollTop, maxTranslate);
        } else {
          translateY = Math.max(0, Math.min(scrollTop, maxTranslate));
        }

        inner.style.position = 'fixed';
        inner.style.top = `${bannerOffset}px`;
        inner.style.transform = `translateY(-${translateY}px)`;
      }

      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateSidebar);
        ticking = true;
      }
    };

    const handleResize = () => {
      if (window.innerWidth < 1280) {
        if (inner) {
          inner.style.position = '';
          inner.style.top = '';
          inner.style.transform = '';
        }
        return;
      }
      updateSidebar();
    };

    updateSidebar();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isTeamView = leaderboardType === 'team';

  return (
    <div ref={containerRef} className="hidden w-96 shrink-0 flex-col xl:flex">
      <div ref={innerRef} className="mr-28 flex flex-col gap-6 px-4 py-6">
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar
                id={selectedUser.id}
                name={
                  selectedUser.displayName || selectedUser.username || 'User'
                }
                size="md"
                src={selectedUser.profileImageUrl || undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate font-semibold text-foreground">
                    {selectedUser.displayName ||
                      selectedUser.username ||
                      'Anonymous'}
                  </h4>
                  {selectedUser.isAgent ? (
                    <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-500 text-xs">
                      <Bot className="h-3 w-3" />
                      AI
                    </span>
                  ) : (
                    <OnChainBadge
                      isRegistered={selectedUser.onChainRegistered ?? false}
                      nftTokenId={selectedUser.nftTokenId ?? null}
                      size="sm"
                    />
                  )}
                </div>
                {selectedUser.username && (
                  <p className="truncate text-muted-foreground text-sm">
                    @{selectedUser.username}
                  </p>
                )}
              </div>
              {authenticated && user && selectedUser.id !== user.id && (
                <FollowButton
                  userId={selectedUser.id}
                  size="sm"
                  variant="button"
                  className="w-20"
                />
              )}
            </div>

            {isTeamView && selectedUser.teamTotalPoints !== undefined ? (
              <div className="border-border border-b pb-3">
                <div className="text-muted-foreground text-xs">
                  Team Total Points
                </div>
                <div className="font-bold text-foreground text-xl">
                  {selectedUser.teamTotalPoints.toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="border-border border-b pb-3">
                <div className="text-muted-foreground text-xs">
                  Total Points
                </div>
                <div className="font-bold text-foreground text-xl">
                  {selectedUser.totalPoints.toLocaleString()}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground text-xs">
                  Lifetime P&L
                </div>
                <div
                  className={`font-bold ${
                    selectedUser.lifetimePnL === 0
                      ? 'text-muted-foreground'
                      : selectedUser.lifetimePnL > 0
                        ? 'text-green-500'
                        : 'text-red-500'
                  }`}
                >
                  {selectedUser.lifetimePnL === 0
                    ? formatCurrency(0)
                    : `${selectedUser.lifetimePnL > 0 ? '+' : '-'}${formatCurrency(Math.abs(selectedUser.lifetimePnL))}`}
                </div>
              </div>

              <div>
                <div className="text-muted-foreground text-xs">Balance</div>
                <div className="font-bold text-foreground">
                  {selectedUser.balance.toLocaleString()}
                </div>
              </div>

              {isTeamView &&
                selectedUser.agentCount !== undefined &&
                selectedUser.agentCount > 0 && (
                  <div className="col-span-2 border-border border-t pt-3">
                    <div className="mb-2 text-muted-foreground text-xs">
                      Team Breakdown
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          User Points
                        </span>
                        <span className="font-semibold text-foreground">
                          {(selectedUser.userPoints ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Agent Points ({selectedUser.agentCount}{' '}
                          {selectedUser.agentCount === 1 ? 'agent' : 'agents'})
                        </span>
                        <span className="font-semibold text-foreground">
                          {(selectedUser.agentPoints ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            <div className="flex flex-col gap-2">
              <Link
                href={getProfileUrl(selectedUser.id, selectedUser.username)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View Profile
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-3 font-semibold text-foreground">
            How Points Work
          </h3>
          <div className="space-y-2 text-muted-foreground text-sm">
            <p>
              <span className="font-semibold text-foreground">
                Total Points:
              </span>{' '}
              Your wallet balance + open position values + reputation
            </p>
            {isTeamView && (
              <p>
                <span className="font-semibold text-foreground">
                  Team Points:
                </span>{' '}
                Your total points combined with all your AI agents' points
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
