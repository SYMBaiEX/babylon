'use client';

/**
 * Group Details Modal
 * 
 * Shows group details with member management for admins
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Crown, UserMinus, UserPlus, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface GroupMember {
  userId: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  joinedAt: string;
  isAdmin: boolean;
}

interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  members: GroupMember[];
  isCurrentUserAdmin: boolean;
}

interface GroupDetailsModalProps {
  groupId: string;
  onClose: () => void;
  onGroupUpdated: () => void;
}

export function GroupDetailsModal({ groupId, onClose, onGroupUpdated }: GroupDetailsModalProps) {
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadGroup = async () => {
    try {
      const response = await fetch(`/api/user-groups/${groupId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load group');
      }

      setGroup(data.data);
    } catch (error) {
      console.error('Error loading group:', error);
      toast.error('Failed to load group details');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGroup();
  }, [groupId]);

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      const response = await fetch(`/api/user-groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      toast.success('Member removed');
      loadGroup();
      onGroupUpdated();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove member');
    }
  };

  const handleToggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    try {
      const url = isCurrentlyAdmin
        ? `/api/user-groups/${groupId}/admins/${userId}`
        : `/api/user-groups/${groupId}/admins`;

      const response = await fetch(url, {
        method: isCurrentlyAdmin ? 'DELETE' : 'POST',
        headers: isCurrentlyAdmin ? undefined : {
          'Content-Type': 'application/json',
        },
        body: isCurrentlyAdmin ? undefined : JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update admin status');
      }

      toast.success(isCurrentlyAdmin ? 'Admin privileges revoked' : 'Admin privileges granted');
      loadGroup();
      onGroupUpdated();
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update admin status');
    }
  };

  if (isLoading || !group) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="text-center py-8">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{group.name}</DialogTitle>
          {group.description && (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Members ({group.members.length})</h4>
            {group.isCurrentUserAdmin && (
              <Button size="sm" variant="outline">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {group.members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.profileImageUrl || undefined} />
                    <AvatarFallback>
                      {((member.displayName || member.username || 'U')?.[0] ?? 'U').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {member.displayName || member.username || 'Unknown User'}
                      </p>
                      {member.isAdmin && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                    {member.username && member.displayName && (
                      <p className="text-xs text-muted-foreground">@{member.username}</p>
                    )}
                  </div>
                </div>

                {group.isCurrentUserAdmin && member.userId !== group.createdById && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleAdmin(member.userId, member.isAdmin)}
                      title={member.isAdmin ? 'Revoke admin' : 'Grant admin'}
                    >
                      <Shield className={`h-4 w-4 ${member.isAdmin ? 'text-yellow-500' : ''}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveMember(member.userId)}
                      title="Remove member"
                    >
                      <UserMinus className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

