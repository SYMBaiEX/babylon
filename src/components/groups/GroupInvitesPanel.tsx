'use client';

/**
 * Group Invites Panel
 * 
 * Shows all pending group invitations
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GroupInviteNotification } from './GroupInviteNotification';
import { toast } from 'sonner';

interface GroupInvite {
  id: string;
  groupId: string;
  invitedAt: string;
  group: {
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
  } | null;
  inviter: {
    id: string;
    name: string;
    username: string | null;
    profileImageUrl: string | null;
  } | null;
}

export function GroupInvitesPanel() {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadInvites = async () => {
    try {
      const response = await fetch('/api/user-groups/invites');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load invites');
      }

      setInvites(data.data.invites);
    } catch (error) {
      console.error('Error loading invites:', error);
      toast.error('Failed to load invites');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  const handleInviteResponse = () => {
    loadInvites(); // Reload invites after response
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading invites...</div>
        </CardContent>
      </Card>
    );
  }

  if (invites.length === 0) {
    return null; // Don't show anything if no invites
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pending Invitations ({invites.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invites.map((invite) => (
          <GroupInviteNotification
            key={invite.id}
            inviteId={invite.id}
            groupName={invite.group?.name || 'Unknown Group'}
            groupDescription={invite.group?.description}
            inviterName={invite.inviter?.name || 'Unknown User'}
            inviterImage={invite.inviter?.profileImageUrl}
            memberCount={invite.group?.memberCount}
            onAccept={handleInviteResponse}
            onDecline={handleInviteResponse}
          />
        ))}
      </CardContent>
    </Card>
  );
}

