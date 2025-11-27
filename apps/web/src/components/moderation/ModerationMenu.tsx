/**
 * Moderation menu component for user moderation actions.
 *
 * Provides a dropdown menu with options to mute, block, and report users.
 * Opens corresponding modals for each action. Hides report option for NPCs
 * (can only block/mute NPCs). Includes overlay to close menu on outside click.
 *
 * Features:
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

import { Ban, Flag, MoreHorizontal, VolumeX } from 'lucide-react';
import { useState } from 'react';
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
  const [showMenu, setShowMenu] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const displayName = targetDisplayName || targetUsername || 'User';

  const handleAction = () => {
    setShowMenu(false);
    onActionComplete?.();
  };

  return (
    <div className="relative">
      {/* Menu Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="rounded-lg p-2 transition-colors hover:bg-muted"
        aria-label="More options"
      >
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <>
          {/* Overlay to close menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card shadow-lg">
            <div className="py-1">
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
        </>
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
