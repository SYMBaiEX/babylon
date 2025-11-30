'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Check, Loader2, Search, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { cn } from '@babylon/shared/client';
import { useAuthStore } from '@/stores/authStore';

/**
 * User structure for group creation modal.
 */
interface User {
  id: string;
  displayName: string | null;
  username: string | null;
  profileImageUrl: string | null;
}

/**
 * Create group modal component for creating new user groups.
 *
 * Provides a form interface for creating groups with name input and
 * member selection. Includes user search functionality and automatic
 * group name generation from members. Creates both group and associated
 * chat on creation.
 *
 * Features:
 * - Group name input
 * - User search
 * - Member selection
 * - Auto-generated group names
 * - Form validation
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 *
 * @param props - CreateGroupModal component props
 * @returns Create group modal element or null if not open
 *
 * @example
 * ```tsx
 * <CreateGroupModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   onGroupCreated={(groupId, chatId) => router.push(`/groups/${groupId}`)}
 * />
 * ```
 */
interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (groupId: string, chatId: string) => void;
}

export function CreateGroupModal({
  isOpen,
  onClose,
  onGroupCreated,
}: CreateGroupModalProps) {
  const { getAccessToken } = usePrivy();
  const { user } = useAuthStore();
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setGroupName('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
      setError(null);
    }
  }, [isOpen]);

  // Search for users
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setSearching(true);
      const token = await getAccessToken();
      const response = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      }
      setSearching(false);
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, getAccessToken]);

  const handleAddUser = (user: User) => {
    if (!selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  };

  const handleCreateGroup = async () => {
    // Generate group name if not provided
    let finalGroupName = groupName.trim();

    if (!finalGroupName) {
      // Auto-generate from members
      const memberNames = selectedUsers
        .slice(0, 2)
        .map((u) => u.displayName || u.username || 'User');
      const currentUserName = user?.displayName || user?.username || 'You';

      if (selectedUsers.length === 0) {
        setError('Please add at least one member or enter a group name');
        return;
      } else if (selectedUsers.length === 1) {
        finalGroupName = `${currentUserName}, ${memberNames[0]}`;
      } else if (selectedUsers.length === 2) {
        finalGroupName = `${currentUserName}, ${memberNames[0]}, ${memberNames[1]}`;
      } else {
        finalGroupName = `${currentUserName}, ${memberNames[0]}, ${memberNames[1]} +${selectedUsers.length - 2}`;
      }
    }

    setCreating(true);
    setError(null);

    const token = await getAccessToken();
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: finalGroupName,
        memberIds: selectedUsers.map((u) => u.id),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setCreating(false);
      throw new Error(data.error || 'Failed to create group');
    }

    const data = await response.json();
    onGroupCreated(data.group.id, data.group.chatId);
    onClose();
  };

  if (!isOpen) return null;

  const handleClose = () => {
    if (creating) return; // Prevent closing during creation
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-border border-b p-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-xl">Create New Group</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            disabled={creating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Group Name (Optional) */}
            <div>
              <label className="mb-2 block font-medium text-sm">
                Group Name{' '}
                <span className="font-normal text-muted-foreground text-xs">
                  (Optional)
                </span>
              </label>
              <input
                id="groupName"
                type="text"
                placeholder="Leave blank to auto-name from members..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-border bg-sidebar px-4 py-3 transition-colors focus:border-primary focus:outline-none"
                disabled={creating}
              />
              {groupName && (
                <p className="mt-1 text-muted-foreground text-xs">
                  {groupName.length}/100 characters
                </p>
              )}
            </div>

            {/* Selected Users */}
            {selectedUsers.length > 0 && (
              <div className="space-y-2">
                <label className="block font-medium text-sm">
                  Members ({selectedUsers.length})
                </label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-sidebar p-3">
                  {selectedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5"
                    >
                      <Avatar
                        imageUrl={user.profileImageUrl || undefined}
                        name={user.username || user.displayName || '?'}
                        size="sm"
                      />
                      <span className="text-sm">
                        {user.displayName || user.username || 'Unknown'}
                      </span>
                      <button
                        onClick={() => handleRemoveUser(user.id)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Search */}
            <div>
              <label className="mb-2 block font-medium text-sm">
                Add Members
              </label>
              <div className="relative">
                <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by username or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-sidebar py-3 pr-10 pl-9 transition-colors focus:border-primary focus:outline-none"
                />
                {searching && (
                  <Loader2 className="-translate-y-1/2 absolute top-1/2 right-3 h-4 w-4 animate-spin text-primary" />
                )}
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="max-h-[200px] overflow-hidden overflow-y-auto rounded-lg border border-border">
                {searchResults.map((user) => {
                  const isSelected = selectedUsers.find(
                    (u) => u.id === user.id
                  );
                  return (
                    <button
                      key={user.id}
                      onClick={() => !isSelected && handleAddUser(user)}
                      className={cn(
                        'flex w-full items-center gap-3 p-3 text-left transition-colors',
                        isSelected
                          ? 'cursor-not-allowed bg-muted/50 opacity-50'
                          : 'hover:bg-sidebar'
                      )}
                      disabled={!!isSelected}
                    >
                      <Avatar
                        imageUrl={user.profileImageUrl || undefined}
                        name={user.username || user.displayName || '?'}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">
                          {user.displayName || user.username || 'Unknown'}
                        </div>
                        {user.username && (
                          <div className="truncate text-muted-foreground text-xs">
                            @{user.username}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {searchQuery.length >= 2 &&
              searchResults.length === 0 &&
              !searching && (
                <div className="py-4 text-center text-muted-foreground text-sm">
                  No users found
                </div>
              )}

            {!searchQuery && selectedUsers.length === 0 && (
              <div className="rounded-lg border border-border border-dashed bg-sidebar py-4 text-center text-muted-foreground text-sm">
                <p>Search for users to add to your group</p>
                <p className="mt-1 text-xs">
                  Group name will auto-generate if not specified
                </p>
              </div>
            )}
          </div>

          {/* Preview of auto-generated name */}
          {!groupName && selectedUsers.length > 0 && (
            <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <p className="text-blue-700 text-xs dark:text-blue-300">
                <strong>Auto-name preview:</strong> {(() => {
                  const memberNames = selectedUsers
                    .slice(0, 2)
                    .map((u) => u.displayName || u.username || 'User');
                  const currentUserName =
                    user?.displayName || user?.username || 'You';

                  if (selectedUsers.length === 1) {
                    return `${currentUserName}, ${memberNames[0]}`;
                  } else if (selectedUsers.length === 2) {
                    return `${currentUserName}, ${memberNames[0]}, ${memberNames[1]}`;
                  } else {
                    return `${currentUserName}, ${memberNames[0]}, ${memberNames[1]} +${selectedUsers.length - 2}`;
                  }
                })()}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 rounded-lg border border-border bg-sidebar px-4 py-3 transition-colors hover:bg-accent"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={creating || selectedUsers.length === 0}
              className={cn(
                'flex-1 rounded-lg px-4 py-3 font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                `Create Group${selectedUsers.length > 0 ? ` (${selectedUsers.length + 1} members)` : ''}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
