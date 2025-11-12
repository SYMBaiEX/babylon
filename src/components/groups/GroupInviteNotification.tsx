'use client';

/**
 * Group Invite Notification Component
 * 
 * Displays group invites in notifications with accept/decline actions
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Check, X } from 'lucide-react';
import { toast } from 'sonner';

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
    try {
      const response = await fetch(`/api/user-groups/invites/${inviteId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invite');
      }

      toast.success(`You joined ${groupName}!`);
      setIsResponded(true);
      onAccept?.();
    } catch (error) {
      console.error('Error accepting invite:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept invite');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user-groups/invites/${inviteId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to decline invite');
      }

      toast.success('Invite declined');
      setIsResponded(true);
      onDecline?.();
    } catch (error) {
      console.error('Error declining invite:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to decline invite');
    } finally {
      setIsLoading(false);
    }
  };

  if (isResponded) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={inviterImage || undefined} />
            <AvatarFallback>
              {inviterName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Group Invitation</span>
            </div>
            
            <p className="text-sm text-muted-foreground mb-2">
              <span className="font-medium">{inviterName}</span> invited you to join{' '}
              <span className="font-medium">{groupName}</span>
            </p>

            {groupDescription && (
              <p className="text-sm text-muted-foreground mb-2">
                {groupDescription}
              </p>
            )}

            {memberCount !== undefined && (
              <p className="text-xs text-muted-foreground mb-3">
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAccept}
                disabled={isLoading}
                className="flex-1"
              >
                <Check className="h-4 w-4 mr-2" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDecline}
                disabled={isLoading}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Decline
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

