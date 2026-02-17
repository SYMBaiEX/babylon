'use client';

import {
  formatCurrency,
  getActorProfileUrl,
  getProfileUrl,
} from '@babylon/shared';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { FollowButton } from '@/components/interactions/FollowButton';
import { OnChainBadge } from '@/components/profile/OnChainBadge';
import { Avatar } from '@/components/shared/Avatar';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { useAuth } from '@/hooks/useAuth';

export interface SelectedUser {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  totalPoints?: number;
  allPoints: number;
  invitePoints: number;
  earnedPoints: number;
  bonusPoints: number;
  referralCount: number;
  balance: number;
  lifetimePnL: number;
  rank: number;
  isActor?: boolean;
  tier?: string | null;
  onChainRegistered?: boolean;
  nftTokenId?: number | null;
}

interface LeaderboardWidgetSidebarProps {
  selectedUser: SelectedUser | null;
  pointsCategory: 'total' | 'all' | 'earned' | 'referral';
}

/**
 * Widget sidebar for leaderboard page.
 *
 * Shows selected user's profile info, stats, and a link to their profile.
 * Implements smart scrolling behavior on XL+ screens.
 */
export function LeaderboardWidgetSidebar({
  selectedUser,
}: LeaderboardWidgetSidebarProps) {
  const { authenticated, user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    // Only run on xl+ screens
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

      // Determine scroll direction
      if (scrollTop > lastScrollTop) {
        direction = 'down';
      } else if (scrollTop < lastScrollTop) {
        direction = 'up';
      }
      lastScrollTop = scrollTop;

      // Check if sidebar fits in viewport
      const fitsInViewport = sidebarHeight <= viewportHeight - bannerOffset;

      if (fitsInViewport) {
        inner.style.position = 'fixed';
        inner.style.top = `${bannerOffset}px`;
        inner.style.transform = '';
      } else {
        // Sidebar is taller than viewport - implement bi-directional scroll lock
        const maxTranslate = sidebarHeight - (viewportHeight - bannerOffset);

        if (direction === 'down') {
          // Scrolling down: pin sidebar bottom to viewport bottom
          translateY = Math.min(scrollTop, maxTranslate);
        } else {
          // Scrolling up: gradually reveal top of sidebar
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

  return (
    <div
      ref={containerRef}
      className="hidden w-96 flex-shrink-0 flex-col xl:flex"
    >
      <div ref={innerRef} className="mr-28 flex flex-col gap-6 px-4 py-6">
        {/* Selected User Widget */}
        {selectedUser && (
          <div className="space-y-4">
            {/* User Header */}
            <div className="flex items-center gap-3">
              <Avatar
                id={selectedUser.id}
                name={
                  selectedUser.displayName || selectedUser.username || 'User'
                }
                type={selectedUser.isActor ? 'actor' : undefined}
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
                  {selectedUser.isActor ? (
                    <VerifiedBadge size="sm" />
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

            {/* Total Points (primary metric) */}
            {selectedUser.totalPoints !== undefined && (
              <div className="border-border border-b pb-3">
                <div className="text-muted-foreground text-xs">
                  Total Points
                </div>
                <div className="font-bold text-foreground text-xl">
                  {selectedUser.totalPoints.toLocaleString()}
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* P&L */}
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

              {/* Referrals */}
              <div>
                <div className="text-muted-foreground text-xs">Referrals</div>
                <div className="font-bold text-foreground">
                  {selectedUser.referralCount}
                </div>
              </div>

              {/* All Points Breakdown */}
              {(selectedUser.earnedPoints !== 0 ||
                selectedUser.invitePoints > 0 ||
                selectedUser.bonusPoints > 0) && (
                <div className="col-span-2 border-border border-t pt-3">
                  <div className="mb-2 text-muted-foreground text-xs">
                    Points Breakdown
                  </div>
                  <div className="space-y-1 text-sm">
                    {selectedUser.earnedPoints !== 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Earned</span>
                        <span
                          className={`font-semibold ${selectedUser.earnedPoints > 0 ? 'text-green-500' : 'text-red-500'}`}
                        >
                          {selectedUser.earnedPoints > 0 ? '+' : ''}
                          {selectedUser.earnedPoints.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {selectedUser.invitePoints > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Referral</span>
                        <span className="font-semibold text-foreground">
                          +{selectedUser.invitePoints.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {selectedUser.bonusPoints > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bonus</span>
                        <span className="font-semibold text-foreground">
                          +{selectedUser.bonusPoints.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <Link
                href={
                  selectedUser.isActor
                    ? getActorProfileUrl(selectedUser.id)
                    : getProfileUrl(selectedUser.id, selectedUser.username)
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View Profile
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Leaderboard Info */}
        <div>
          <h3 className="mb-3 font-semibold text-foreground">
            How Points Work
          </h3>
          <div className="space-y-2 text-muted-foreground text-sm">
            <p>
              <span className="font-semibold text-foreground">
                Earned Points:
              </span>{' '}
              From trading P&L across perps and prediction markets
            </p>
            <p>
              <span className="font-semibold text-foreground">
                Referral Points:
              </span>{' '}
              Invite friends and earn points when they join
            </p>
            <p>
              <span className="font-semibold text-foreground">
                Bonus Points:
              </span>{' '}
              Complete profile, link email and wallet
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
