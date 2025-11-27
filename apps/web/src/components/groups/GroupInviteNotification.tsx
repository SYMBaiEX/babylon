'use client';

import { Check, Loader2, Users, X } from 'lucide-react';
/**
 * Group invite notification component for displaying group invitations in notifications.
 *
 * Displays a notification card for group invitations with inviter information
 * and accept/decline actions. Shows group details and member count. Handles
 * API calls and hides after response.
 *
 * Features:
 * - Inviter display
 * - Group information
 * - Accept functionality
 * - Decline functionality
 * - Loading states
 * - Auto-hide after response
 *
 * @param props - GroupInviteNotification component props
 * @returns Group invite notification element or null if responded
 *
 * @example
 * ```tsx
 * <GroupInviteNotification
 *   inviteId="invite-123"
 *   groupName="Trading Group"
 *   inviterName="Alice"
 *   onAccept={() => refreshNotifications()}
 * />
 * ```
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/Avatar';

interface GroupInviteNotificationProps {
  inviteId: string;
  groupName: string;
  groupDescription?: string | null;
  inviterName: string;
  inviterImage?: string | null;
  memberCount?: number;
  onAccept?: () => void;
  onDecline?: () => void;
}

export function GroupInviteNotification({
  inviteId,
  groupName,
  groupDescription,
  inviterName,
  inviterImage,
  memberCount,
  onAccept,
  onDecline,
}: GroupInviteNotificationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isResponded, setIsResponded] = useState(false);

  const handleAccept = async () => {
    setIsLoading(true);
    const response = await fetch(`/api/user-groups/invites/${inviteId}`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!response.ok) {
      setIsLoading(false);
      throw new Error(data.error || 'Failed to accept invite');
    }

    toast.success(`You joined ${groupName}!`);
    setIsResponded(true);
    onAccept?.();
    setIsLoading(false);
  };

  const handleDecline = async () => {
    setIsLoading(true);
    const response = await fetch(`/api/user-groups/invites/${inviteId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (!response.ok) {
      setIsLoading(false);
      throw new Error(data.error || 'Failed to decline invite');
    }

    toast.success('Invite declined');
    setIsResponded(true);
    onDecline?.();
    setIsLoading(false);
  };

  if (isResponded) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-sidebar p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar
          imageUrl={inviterImage || undefined}
          name={inviterName}
          size="md"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Group Invitation</span>
            </div>

            <p className="mb-2 text-sm">
              <span className="font-medium">{inviterName}</span> invited you to
              join <span className="font-medium">{groupName}</span>
            </p>

            {groupDescription && (
              <p className="mb-2 line-clamp-2 text-muted-foreground text-sm">
                {groupDescription}
              </p>
            )}

            {memberCount !== undefined && (
              <p className="text-muted-foreground text-xs">
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="inline h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="mr-1 inline h-4 w-4" />
                  Accept
                </>
              )}
            </button>
            <button
              onClick={handleDecline}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2 font-medium text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="inline h-4 w-4 animate-spin" />
              ) : (
                <>
                  <X className="mr-1 inline h-4 w-4" />
                  Decline
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
