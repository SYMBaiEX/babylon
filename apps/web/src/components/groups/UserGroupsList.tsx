'use client';

import { Crown, Plus, Users } from 'lucide-react';
/**
 * User groups list component for displaying groups the user is a member of.
 *
 * Fetches and displays all groups the current user is a member of. Includes
 * create group button and group details modal. Shows admin indicators and
 * member counts.
 *
 * Features:
 * - Groups list display
 * - Create group button
 * - Group details modal
 * - Admin indicators
 * - Member count display
 * - Loading states
 * - Empty state handling
 *
 * @returns User groups list element
 */
import { useCallback, useEffect, useState } from 'react';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupDetailsModal } from './GroupDetailsModal';

/**
 * User group structure for user groups list.
 */
interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  memberCount: number;
  isAdmin: boolean;
}

export function UserGroupsList() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    const response = await fetch('/api/user-groups');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load groups');
    }

    setGroups(data.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="text-center text-muted-foreground">
          Loading groups...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="flex items-center justify-between border-border border-b p-6">
          <h3 className="font-bold text-lg">My Groups</h3>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="mr-1 inline h-4 w-4" />
            Create Group
          </button>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>You haven't joined any groups yet.</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-2 text-primary text-sm hover:underline"
              >
                Create your first group
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-sidebar p-4 text-left transition-colors hover:bg-sidebar/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{group.name}</h3>
                      {group.isAdmin && (
                        <Crown className="h-4 w-4 flex-shrink-0 text-yellow-500" />
                      )}
                    </div>
                    {group.description && (
                      <p className="truncate text-muted-foreground text-sm">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2 text-muted-foreground text-sm">
                    <Users className="h-4 w-4" />
                    <span>{group.memberCount}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onGroupCreated={() => {
          loadGroups();
        }}
      />

      {selectedGroupId && (
        <GroupDetailsModal
          groupId={selectedGroupId}
          onClose={() => setSelectedGroupId(null)}
          onGroupUpdated={loadGroups}
        />
      )}
    </>
  );
}
