/**
 * Moderation menu component for user moderation actions.
 *
 * Provides a dropdown menu with options to follow, mute, block, and report users.
 * Opens corresponding modals for each action. Hides report option for NPCs
 * (can only block/mute NPCs). Includes overlay to close menu on outside click.
 *
 * Features:
 * - Follow/unfollow user option
 * - Mute user option
 * - Block user option
 * - Report user option (hidden for NPCs)
 * - Modal integration
 * - Overlay click to close
 *
 * @param props - ModerationMenu component props
 * @returns Moderation menu element
 *
 * @example
 * ```tsx
 * <ModerationMenu
 *   targetUserId="user-123"
 *   targetUsername="alice"
 *   isNPC={false}
 *   onActionComplete={() => refreshFeed()}
 * />
 * ```
 */
'use client';

import {
  Ban,
  Flag,
  Loader2,
  MoreHorizontal,
  UserMinus,
  UserPlus,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSocialTracking } from '@/hooks/usePostHog';
import { getAuthToken } from '@/lib/auth';
import { BlockUserModal } from './BlockUserModal';
import { MuteUserModal } from './MuteUserModal';
import { ReportModal } from './ReportModal';

interface ModerationMenuProps {
  targetUserId: string;
  targetUsername?: string;
  targetDisplayName?: string;
  targetProfileImageUrl?: string;
  postId?: string; // Optional: if reporting a specific post
  isNPC?: boolean; // True if target is an NPC/actor (can block/mute but not report)
  onActionComplete?: () => void;
}

export function ModerationMenu({
  targetUserId,
  targetUsername,
  targetDisplayName,
  targetProfileImageUrl,
  postId,
  isNPC = false,
  onActionComplete,
}: ModerationMenuProps) {
  const { authenticated, user } = useAuth();
  const { trackFollow } = useSocialTracking();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [isCheckingFollow, setIsCheckingFollow] = useState(true);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, openUpward: false });

  const displayName = targetDisplayName || targetUsername || 'User';

  // Calculate menu position when opening
  const updateMenuPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = 200; // Approximate menu height
      const menuWidth = 224; // w-56 = 14rem = 224px
      const padding = 8;
      
      // Check if there's enough space below
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight + padding;
      
      // Calculate left position (align right edge of menu with right edge of button)
      let left = rect.right - menuWidth;
      // Ensure menu doesn't go off-screen left
      if (left < padding) left = padding;
      
      setMenuPosition({
        top: openUpward ? rect.top - padding : rect.bottom + padding,
        left,
        openUpward,
      });
    }
  };

  // Check follow status when menu opens
  useEffect(() => {
    if (!showMenu || !authenticated || !user) {
      setIsCheckingFollow(false);
      return;
    }

    const checkFollowStatus = async () => {
      setIsCheckingFollow(true);
      const token = getAuthToken();
      if (!token) {
        setIsCheckingFollow(false);
        return;
      }

      try {
        const encodedIdentifier = encodeURIComponent(targetUserId);
        const response = await fetch(`/api/users/${encodedIdentifier}/follow`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setIsFollowing(data.isFollowing || false);
        } else {
          setIsFollowing(false);
        }
      } catch {
        setIsFollowing(false);
      }
      setIsCheckingFollow(false);
    };

    checkFollowStatus();
  }, [showMenu, authenticated, user, targetUserId]);

  const handleFollow = async () => {
    if (!authenticated || !user) {
      toast.error('Please sign in to follow users');
      return;
    }

    setIsFollowLoading(true);
    const token = getAuthToken();
    if (!token) {
      toast.error('Authentication required');
      setIsFollowLoading(false);
      return;
    }

    const newFollowingState = !isFollowing;
    const method = newFollowingState ? 'POST' : 'DELETE';

    // Optimistic update
    setIsFollowing(newFollowingState);

    try {
      const encodedIdentifier = encodeURIComponent(targetUserId);
      const response = await fetch(`/api/users/${encodedIdentifier}/follow`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        trackFollow(targetUserId, newFollowingState);
        toast.success(
          newFollowingState
            ? `Following ${displayName}`
            : `Unfollowed ${displayName}`
        );
        setShowMenu(false);
      } else {
        // Revert optimistic update
        setIsFollowing(!newFollowingState);
        const errorData = await response.json();
        const errorMessage =
          typeof errorData?.error === 'string'
            ? errorData.error
            : errorData?.error?.message || 'Failed to update follow status';
        toast.error(errorMessage);
      }
    } catch {
      // Revert optimistic update
      setIsFollowing(!newFollowingState);
      toast.error('Network error. Please try again.');
    }

    setIsFollowLoading(false);
  };

  const handleAction = () => {
    setShowMenu(false);
    onActionComplete?.();
  };

  return (
    <div className="relative">
      {/* Menu Button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!showMenu) {
            updateMenuPosition();
          }
          setShowMenu(!showMenu);
        }}
        className="rounded-lg p-2 transition-colors hover:bg-muted"
        aria-label="More options"
      >
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Dropdown Menu - rendered via portal to avoid overflow clipping */}
      {showMenu &&
        createPortal(
          <>
            {/* Overlay to close menu */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />

            {/* Menu */}
            <div
              className="fixed z-50 w-56 rounded-lg border border-border bg-card shadow-lg"
              style={{
                top: menuPosition.openUpward ? 'auto' : menuPosition.top,
                bottom: menuPosition.openUpward ? window.innerHeight - menuPosition.top : 'auto',
                left: menuPosition.left,
              }}
            >
              <div className="py-1">
                {/* Follow/Unfollow option */}
                {authenticated && (
                  <button
                    onClick={handleFollow}
                    disabled={isFollowLoading || isCheckingFollow}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {isFollowLoading || isCheckingFollow ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : isFollowing ? (
                      <UserMinus className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>
                      {isCheckingFollow
                        ? 'Loading...'
                        : isFollowing
                          ? `Unfollow ${displayName}`
                          : `Follow ${displayName}`}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowMuteModal(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                  <span>Mute {displayName}</span>
                </button>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowBlockModal(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-orange-600 text-sm transition-colors hover:bg-muted"
                >
                  <Ban className="h-4 w-4" />
                  <span>Block {displayName}</span>
                </button>

                {/* Only show report option for real users, not NPCs */}
                {!isNPC && (
                  <>
                    <div className="my-1 border-border border-t" />

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowReportModal(true);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-red-600 text-sm transition-colors hover:bg-muted"
                    >
                      <Flag className="h-4 w-4" />
                      <span>Report {postId ? 'post' : 'user'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Modals */}
      <BlockUserModal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        targetUserId={targetUserId}
        targetDisplayName={displayName}
        isNPC={isNPC}
        onSuccess={handleAction}
      />

      <MuteUserModal
        isOpen={showMuteModal}
        onClose={() => setShowMuteModal(false)}
        targetUserId={targetUserId}
        targetDisplayName={displayName}
        isNPC={isNPC}
        onSuccess={handleAction}
      />

      {/* Only show report modal for real users, not NPCs */}
      {!isNPC && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          targetUserId={targetUserId}
          targetUsername={targetUsername}
          targetDisplayName={displayName}
          targetProfileImageUrl={targetProfileImageUrl}
          postId={postId}
          onSuccess={handleAction}
        />
      )}
    </div>
  );
}
