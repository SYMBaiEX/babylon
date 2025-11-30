'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  Crown,
  Edit2,
  Loader2,
  LogOut,
  Settings,
  Shield,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@babylon/shared/client';

/**
 * Group member structure for group settings modal.
 */
interface GroupMember {
  userId: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  joinedAt: string;
  addedBy: string;
  isAdmin: boolean;
}

/**
 * Group details structure from API.
 */
interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  members: GroupMember[];
  isCurrentUserAdmin: boolean;
}

/**
 * Group settings modal component for managing group settings and members.
 *
 * Provides a tabbed interface for managing group general settings (name,
 * description) and members. Includes editing, member management, and
 * delete/leave functionality. Shows different options based on admin status.
 *
 * Features:
 * - Tabbed interface (general, members)
 * - Edit group name/description
 * - Member management
 * - Delete group (creator only)
 * - Leave group
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 *
 * @param props - GroupSettingsModal component props
 * @returns Group settings modal element or null if not open
 *
 * @example
 * ```tsx
 * <GroupSettingsModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   groupId="group-123"
 *   currentUserId="user-456"
 *   onGroupUpdated={() => refreshGroup()}
 * />
 * ```
 */
interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  onGroupUpdated?: () => void;
  onGroupDeleted?: () => void;
  currentUserId: string;
}

/**
 * Tab type for group settings modal.
 */
type Tab = 'general' | 'members';

export function GroupSettingsModal({
  isOpen,
  onClose,
  groupId,
  onGroupUpdated,
  onGroupDeleted,
  currentUserId,
}: GroupSettingsModalProps) {
  const { getAccessToken } = usePrivy();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // General settings state
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isSaving, setSaving] = useState(false);

  // Delete state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Leave state
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Member management state
  const [managingMemberId, setManagingMemberId] = useState<string | null>(null);

  const loadGroupDetails = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) throw new Error('Authentication required');

    const response = await fetch(`/api/user-groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setLoading(false);
      throw new Error('Failed to load group details');
    }

    const data = await response.json();
    setGroup(data.data);
    setEditedName(data.data.name);
    setEditedDescription(data.data.description || '');
    setLoading(false);
  }, [groupId, getAccessToken]);

  // Load group details
  useEffect(() => {
    if (isOpen && groupId) {
      loadGroupDetails();
    }
  }, [isOpen, groupId, loadGroupDetails]);

  const handleSaveDetails = async () => {
    if (!group) return;

    setSaving(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setSaving(false);
      throw new Error('Authentication required');
    }

    const response = await fetch(`/api/user-groups/${groupId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: editedName,
        description: editedDescription || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setSaving(false);
      throw new Error(errorData.error || 'Failed to update group');
    }

    // Reload group details
    await loadGroupDetails();
    setIsEditing(false);
    onGroupUpdated?.();
    setSaving(false);
  };

  const handleDeleteGroup = async () => {
    setIsDeleting(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      throw new Error('Authentication required');
    }

    const response = await fetch(`/api/user-groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      throw new Error(errorData.error || 'Failed to delete group');
    }

    onGroupDeleted?.();
    onClose();
  };

  const handleLeaveGroup = async () => {
    setIsLeaving(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setIsLeaving(false);
      setIsLeaveConfirmOpen(false);
      throw new Error('Authentication required');
    }

    const response = await fetch(
      `/api/user-groups/${groupId}/members/${currentUserId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      setIsLeaving(false);
      setIsLeaveConfirmOpen(false);
      throw new Error(errorData.error || 'Failed to leave group');
    }

    onGroupDeleted?.(); // Treat as deleted from user's perspective
    onClose();
  };

  const handleRemoveMember = async (memberId: string) => {
    setManagingMemberId(memberId);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setManagingMemberId(null);
      throw new Error('Authentication required');
    }

    const response = await fetch(
      `/api/user-groups/${groupId}/members/${memberId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      setManagingMemberId(null);
      throw new Error(errorData.error || 'Failed to remove member');
    }

    await loadGroupDetails();
    onGroupUpdated?.();
    setManagingMemberId(null);
  };

  const handlePromoteToAdmin = async (memberId: string) => {
    setManagingMemberId(memberId);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setManagingMemberId(null);
      throw new Error('Authentication required');
    }

    const response = await fetch(`/api/user-groups/${groupId}/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId: memberId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setManagingMemberId(null);
      throw new Error(errorData.error || 'Failed to promote member');
    }

    await loadGroupDetails();
    onGroupUpdated?.();
    setManagingMemberId(null);
  };

  const handleDemoteFromAdmin = async (memberId: string) => {
    setManagingMemberId(memberId);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setManagingMemberId(null);
      throw new Error('Authentication required');
    }

    const response = await fetch(
      `/api/user-groups/${groupId}/admins/${memberId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      setManagingMemberId(null);
      throw new Error(errorData.error || 'Failed to demote admin');
    }

    await loadGroupDetails();
    onGroupUpdated?.();
    setManagingMemberId(null);
  };

  const isCreator = group?.createdById === currentUserId;
  const isAdmin = group?.isCurrentUserAdmin;

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving || isDeleting || isLeaving) return;
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
          className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-border border-b p-6">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-xl">Group Settings</h2>
            </div>
            <button
              onClick={handleClose}
              className="text-muted-foreground transition-colors hover:text-foreground"
              disabled={isSaving || isDeleting || isLeaving}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 px-6 pt-4">
            <button
              onClick={() => setActiveTab('general')}
              className={cn(
                'rounded-lg px-4 py-2 font-medium text-sm transition-colors',
                activeTab === 'general'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-sidebar hover:bg-accent'
              )}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-sm transition-colors',
                activeTab === 'members'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-sidebar hover:bg-accent'
              )}
            >
              <Users className="h-4 w-4" />
              Members {group && `(${group.members.length})`}
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
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !group ? (
              <div className="py-8 text-center text-muted-foreground">
                Group not found
              </div>
            ) : (
              <>
                {/* General Tab */}
                {activeTab === 'general' && (
                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="mb-2 block font-medium text-sm">
                        Group Name
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                          disabled={!isAdmin}
                        />
                      ) : (
                        <div className="flex items-center justify-between rounded-lg bg-sidebar-accent/30 p-3">
                          <span className="font-medium">{group.name}</span>
                          {isAdmin && (
                            <button
                              onClick={() => setIsEditing(true)}
                              className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="mb-2 block font-medium text-sm">
                        Description
                      </label>
                      {isEditing ? (
                        <textarea
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                          disabled={!isAdmin}
                          placeholder="Add a description..."
                        />
                      ) : (
                        <div className="min-h-[80px] rounded-lg bg-sidebar-accent/30 p-3">
                          <p className="text-muted-foreground text-sm">
                            {group.description || 'No description'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Save/Cancel buttons */}
                    {isEditing && isAdmin && (
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSaveDetails}
                          disabled={isSaving || !editedName.trim()}
                          className="flex-1"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save Changes'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsEditing(false);
                            setEditedName(group.name);
                            setEditedDescription(group.description || '');
                          }}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}

                    {/* Danger Zone */}
                    <div className="mt-8 border-border border-t pt-6">
                      <h3 className="mb-3 font-semibold text-red-500 text-sm">
                        Danger Zone
                      </h3>
                      <div className="space-y-2">
                        {isCreator ? (
                          <Button
                            variant="outline"
                            onClick={() => setIsDeleteConfirmOpen(true)}
                            className="w-full justify-start border-red-500/50 text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Group
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => setIsLeaveConfirmOpen(true)}
                            className="w-full justify-start border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Leave Group
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Members Tab */}
                {activeTab === 'members' && (
                  <div className="space-y-3">
                    {group.members.map((member) => {
                      const isCurrentUser = member.userId === currentUserId;
                      const isMemberCreator =
                        member.userId === group.createdById;
                      const isManaging = managingMemberId === member.userId;

                      return (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between rounded-lg border border-border bg-sidebar p-3 transition-colors hover:bg-sidebar/80"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar
                              id={member.userId}
                              name={
                                member.displayName || member.username || 'User'
                              }
                              type="user"
                              size="md"
                              imageUrl={member.profileImageUrl || undefined}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {member.displayName ||
                                    member.username ||
                                    'User'}
                                </span>
                                {isCurrentUser && (
                                  <span className="text-muted-foreground text-xs">
                                    (You)
                                  </span>
                                )}
                                {isMemberCreator && (
                                  <Crown className="h-3.5 w-3.5 text-yellow-500" />
                                )}
                                {member.isAdmin && (
                                  <Shield className="h-3.5 w-3.5 text-primary" />
                                )}
                              </div>
                              {member.username && member.displayName && (
                                <span className="text-muted-foreground text-xs">
                                  @{member.username}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Member Actions */}
                          {isAdmin && !isCurrentUser && !isMemberCreator && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  member.isAdmin
                                    ? handleDemoteFromAdmin(member.userId)
                                    : handlePromoteToAdmin(member.userId)
                                }
                                disabled={isManaging}
                                className="rounded-md p-2 transition-colors hover:bg-background disabled:opacity-50"
                                title={
                                  member.isAdmin ? 'Remove admin' : 'Make admin'
                                }
                              >
                                {isManaging ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Shield
                                    className={cn(
                                      'h-4 w-4',
                                      member.isAdmin
                                        ? 'text-primary'
                                        : 'text-muted-foreground'
                                    )}
                                  />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  handleRemoveMember(member.userId)
                                }
                                disabled={isManaging}
                                className="rounded-md p-2 transition-colors hover:bg-background disabled:opacity-50"
                                title="Remove member"
                              >
                                {isManaging ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserMinus className="h-4 w-4 text-red-500" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleteConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setIsDeleteConfirmOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 p-6">
              <h3 className="font-semibold text-lg">Delete Group?</h3>
              <p className="text-muted-foreground text-sm">
                This will permanently delete the group and remove all members.
                This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg border border-border bg-sidebar px-4 py-2.5 transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteGroup}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : (
                    'Delete Group'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirmation Dialog */}
      {isLeaveConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLeaving) {
              setIsLeaveConfirmOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 p-6">
              <h3 className="font-semibold text-lg">Leave Group?</h3>
              <p className="text-muted-foreground text-sm">
                Are you sure you want to leave this group? You'll need to be
                re-invited to join again.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsLeaveConfirmOpen(false)}
                  disabled={isLeaving}
                  className="flex-1 rounded-lg border border-border bg-sidebar px-4 py-2.5 transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeaveGroup}
                  disabled={isLeaving}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isLeaving ? (
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  ) : (
                    'Leave Group'
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
