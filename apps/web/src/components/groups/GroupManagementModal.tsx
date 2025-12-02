'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  Crown,
  Loader2,
  LogOut,
  Search,
  Settings,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { cn } from '@babylon/shared';
import { useAuthStore } from '@/stores/authStore';

/**
 * Member structure for group management modal.
 */
interface Member {
  id: string;
  displayName: string | null;
  username: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean;
  joinedAt: Date | string;
}

/**
 * Group details structure for group management modal.
 */
interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  members: Member[];
  isAdmin: boolean;
  isCreator: boolean;
  createdById: string;
}

/**
 * User structure for group management modal.
 */
interface User {
  id: string;
  displayName: string | null;
  username: string | null;
  profileImageUrl: string | null;
}

/**
 * Group management modal component for managing group members and settings.
 *
 * Provides comprehensive group management interface including member list,
 * adding/removing members, promoting/demoting admins, and deleting groups.
 * Includes user search for adding members and confirmation dialogs for
 * destructive actions.
 *
 * Features:
 * - Member list display
 * - Add member functionality
 * - Remove member functionality
 * - Promote/demote admin functionality
 * - Delete group functionality
 * - Leave group functionality
 * - User search
 * - Confirmation dialogs
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 *
 * @param props - GroupManagementModal component props
 * @returns Group management modal element or null if not open
 *
 * @example
 * ```tsx
 * <GroupManagementModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   groupId="group-123"
 *   onGroupUpdated={() => refreshGroups()}
 * />
 * ```
 */
interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | null;
  onGroupUpdated?: () => void;
}

export function GroupManagementModal({
  isOpen,
  onClose,
  groupId,
  onGroupUpdated,
}: GroupManagementModalProps) {
  const { getAccessToken } = usePrivy();
  const { user } = useAuthStore();
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    type: 'remove' | 'promote' | 'demote' | 'delete' | 'leave';
    userId?: string;
    userName?: string;
  } | null>(null);

  // Load group details
  useEffect(() => {
    if (!isOpen || !groupId) {
      setGroupDetails(null);
      setError(null);
      setShowAddMember(false);
      return;
    }

    const loadGroupDetails = async () => {
      setLoading(true);
      setError(null);
      const token = await getAccessToken();
      const response = await fetch(`/api/groups/${groupId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        setLoading(false);
        throw new Error('Failed to load group details');
      }

      const data = await response.json();
      setGroupDetails(data.group);
      setLoading(false);
    };

    loadGroupDetails();
  }, [isOpen, groupId, getAccessToken]);

  // Search for users to add
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
        // Filter out existing members
        const existingMemberIds = groupDetails?.members.map((m) => m.id) || [];
        setSearchResults(
          (data.users || []).filter(
            (u: User) => !existingMemberIds.includes(u.id)
          )
        );
      }
      setSearching(false);
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, getAccessToken, groupDetails]);

  const handleAddMember = async (userId: string) => {
    if (!groupId) return;

    setActionLoading(userId);
    const token = await getAccessToken();
    const response = await fetch(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      setActionLoading(null);
      throw new Error('Failed to add member');
    }

    // Reload group details
    const detailsResponse = await fetch(`/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (detailsResponse.ok) {
      const data = await detailsResponse.json();
      setGroupDetails(data.group);
    }

    setSearchQuery('');
    setSearchResults([]);
    onGroupUpdated?.();
    setActionLoading(null);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!groupId) return;

    setActionLoading(userId);
    const token = await getAccessToken();
    const response = await fetch(
      `/api/groups/${groupId}/members?userId=${userId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      setActionLoading(null);
      setConfirmAction(null);
      throw new Error('Failed to remove member');
    }

    // Reload group details
    const detailsResponse = await fetch(`/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (detailsResponse.ok) {
      const data = await detailsResponse.json();
      setGroupDetails(data.group);
    }

    onGroupUpdated?.();
    setActionLoading(null);
    setConfirmAction(null);
  };

  const handlePromoteToAdmin = async (userId: string) => {
    if (!groupId) return;

    setActionLoading(userId);
    const token = await getAccessToken();
    const response = await fetch(`/api/groups/${groupId}/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      setActionLoading(null);
      setConfirmAction(null);
      throw new Error('Failed to promote member');
    }

    // Reload group details
    const detailsResponse = await fetch(`/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (detailsResponse.ok) {
      const data = await detailsResponse.json();
      setGroupDetails(data.group);
    }

    onGroupUpdated?.();
    setActionLoading(null);
    setConfirmAction(null);
  };

  const handleDemoteAdmin = async (userId: string) => {
    if (!groupId) return;

    setActionLoading(userId);
    const token = await getAccessToken();
    const response = await fetch(
      `/api/groups/${groupId}/admins?userId=${userId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      setActionLoading(null);
      setConfirmAction(null);
      throw new Error('Failed to remove admin status');
    }

    // Reload group details
    const detailsResponse = await fetch(`/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (detailsResponse.ok) {
      const data = await detailsResponse.json();
      setGroupDetails(data.group);
    }

    onGroupUpdated?.();
    setActionLoading(null);
    setConfirmAction(null);
  };

  const handleDeleteGroup = async () => {
    if (!groupId) return;

    setActionLoading('delete');
    const token = await getAccessToken();
    const response = await fetch(`/api/groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setActionLoading(null);
      setConfirmAction(null);
      throw new Error('Failed to delete group');
    }

    onGroupUpdated?.();
    onClose();
  };

  const handleLeaveGroup = async () => {
    if (!groupId || !user) return;

    setActionLoading('leave');
    const token = await getAccessToken();
    const response = await fetch(
      `/api/groups/${groupId}/members?userId=${user.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      setActionLoading(null);
      setConfirmAction(null);
      throw new Error('Failed to leave group');
    }

    onGroupUpdated?.();
    onClose();
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;

    switch (confirmAction.type) {
      case 'remove':
        if (confirmAction.userId) handleRemoveMember(confirmAction.userId);
        break;
      case 'promote':
        if (confirmAction.userId) handlePromoteToAdmin(confirmAction.userId);
        break;
      case 'demote':
        if (confirmAction.userId) handleDemoteAdmin(confirmAction.userId);
        break;
      case 'delete':
        handleDeleteGroup();
        break;
      case 'leave':
        handleLeaveGroup();
        break;
    }
  };

  if (!isOpen || !groupId) return null;

  const handleClose = () => {
    if (actionLoading) return; // Prevent closing during actions
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-border border-b p-6">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-xl">
                {groupDetails?.name || 'Group Settings'}
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="text-muted-foreground transition-colors hover:text-foreground"
              disabled={!!actionLoading}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : groupDetails ? (
              <div className="space-y-4">
                {/* Action Buttons */}
                <div className="flex justify-end gap-2">
                  {/* Leave Group (everyone can do this) */}
                  {!groupDetails.isCreator && (
                    <button
                      onClick={() => setConfirmAction({ type: 'leave' })}
                      disabled={!!actionLoading}
                      className="rounded-lg border border-yellow-600 px-4 py-2 font-medium text-sm text-yellow-600 transition-colors hover:bg-yellow-600/10 disabled:opacity-50"
                    >
                      <LogOut className="mr-2 inline h-4 w-4" />
                      Leave Group
                    </button>
                  )}

                  {/* Delete Group (admins only) */}
                  {groupDetails.isAdmin && (
                    <button
                      onClick={() => setConfirmAction({ type: 'delete' })}
                      disabled={!!actionLoading}
                      className="rounded-lg border border-red-500 px-4 py-2 font-medium text-red-500 text-sm transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="mr-2 inline h-4 w-4" />
                      Delete Group
                    </button>
                  )}
                </div>

                {/* Members Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block font-semibold text-sm">
                      Members ({groupDetails.members.length})
                    </label>
                    {groupDetails.isAdmin && (
                      <button
                        onClick={() => setShowAddMember(!showAddMember)}
                        className="rounded-lg border border-border bg-sidebar px-3 py-1.5 font-medium text-sm transition-colors hover:bg-accent"
                      >
                        {showAddMember ? (
                          <>
                            <X className="mr-1 inline h-4 w-4" />
                            Cancel
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-1 inline h-4 w-4" />
                            Add Member
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Add Member Section */}
                  {showAddMember && groupDetails.isAdmin && (
                    <div className="space-y-2 rounded-lg border border-border bg-sidebar p-3">
                      <div className="relative">
                        <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search users..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background py-2.5 pr-10 pl-9 transition-colors focus:border-primary focus:outline-none"
                        />
                        {searching && (
                          <Loader2 className="-translate-y-1/2 absolute top-1/2 right-3 h-4 w-4 animate-spin text-primary" />
                        )}
                      </div>

                      {searchResults.length > 0 && (
                        <div className="max-h-[150px] overflow-hidden overflow-y-auto rounded-lg border border-border bg-background">
                          {searchResults.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => handleAddMember(user.id)}
                              disabled={actionLoading === user.id}
                              className="flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-sidebar disabled:opacity-50"
                            >
                              <Avatar
                                imageUrl={user.profileImageUrl || undefined}
                                name={user.username || user.displayName || '?'}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-sm">
                                  {user.displayName ||
                                    user.username ||
                                    'Unknown'}
                                </div>
                              </div>
                              {actionLoading === user.id && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Members */}
                  <div className="space-y-2">
                    {groupDetails.members.map((member) => {
                      const isCreator = member.id === groupDetails.createdById;
                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 rounded-lg border border-border bg-sidebar p-3 transition-colors hover:bg-sidebar/80"
                        >
                          <Avatar
                            imageUrl={member.profileImageUrl || undefined}
                            name={member.username || member.displayName || '?'}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-sm">
                                {member.displayName ||
                                  member.username ||
                                  'Unknown'}
                              </span>
                              {isCreator && (
                                <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                              )}
                              {member.isAdmin && (
                                <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
                              )}
                            </div>
                            {member.username && (
                              <div className="truncate text-muted-foreground text-xs">
                                @{member.username}
                              </div>
                            )}
                          </div>

                          {/* Actions (only for admins, not for creator) */}
                          {groupDetails.isAdmin && !isCreator && (
                            <div className="flex items-center gap-1">
                              {!member.isAdmin ? (
                                <button
                                  onClick={() =>
                                    setConfirmAction({
                                      type: 'promote',
                                      userId: member.id,
                                      userName:
                                        member.displayName ||
                                        member.username ||
                                        'this user',
                                    })
                                  }
                                  disabled={!!actionLoading}
                                  className="rounded-md p-2 transition-colors hover:bg-background disabled:opacity-50"
                                  title="Make Admin"
                                >
                                  <Shield className="h-4 w-4 text-primary" />
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    setConfirmAction({
                                      type: 'demote',
                                      userId: member.id,
                                      userName:
                                        member.displayName ||
                                        member.username ||
                                        'this user',
                                    })
                                  }
                                  disabled={!!actionLoading}
                                  className="rounded-md p-2 transition-colors hover:bg-background disabled:opacity-50"
                                  title="Remove Admin"
                                >
                                  <Shield className="h-4 w-4 text-muted-foreground" />
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'remove',
                                    userId: member.id,
                                    userName:
                                      member.displayName ||
                                      member.username ||
                                      'this user',
                                  })
                                }
                                disabled={!!actionLoading}
                                className="rounded-md p-2 transition-colors hover:bg-background disabled:opacity-50"
                                title="Remove Member"
                              >
                                <UserMinus className="h-4 w-4 text-red-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionLoading) {
              setConfirmAction(null);
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 p-6">
              <h3 className="font-semibold text-lg">
                {confirmAction.type === 'delete' && 'Delete Group?'}
                {confirmAction.type === 'remove' && 'Remove Member?'}
                {confirmAction.type === 'promote' && 'Make Admin?'}
                {confirmAction.type === 'demote' && 'Remove Admin?'}
                {confirmAction.type === 'leave' && 'Leave Group?'}
              </h3>
              <p className="text-muted-foreground text-sm">
                {confirmAction.type === 'delete' &&
                  'This will permanently delete the group and all its data. This action cannot be undone.'}
                {confirmAction.type === 'remove' &&
                  `Remove ${confirmAction.userName} from this group? They can be re-invited later.`}
                {confirmAction.type === 'promote' &&
                  `Give ${confirmAction.userName} admin privileges? They will be able to manage members and settings.`}
                {confirmAction.type === 'demote' &&
                  `Remove admin privileges from ${confirmAction.userName}? They will remain a regular member.`}
                {confirmAction.type === 'leave' &&
                  'Are you sure you want to leave this group? You will need to be re-invited to join again.'}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  disabled={!!actionLoading}
                  className="flex-1 rounded-lg border border-border bg-sidebar px-4 py-2.5 transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={!!actionLoading}
                  className={cn(
                    'flex-1 rounded-lg px-4 py-2.5 font-medium transition-colors disabled:opacity-50',
                    confirmAction.type === 'delete' ||
                      confirmAction.type === 'remove'
                      ? 'bg-red-500 text-primary-foreground hover:bg-red-600'
                      : confirmAction.type === 'leave'
                        ? 'bg-yellow-500 text-primary-foreground hover:bg-yellow-600'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {actionLoading ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
