'use client';

import { cn, getCurrentChainId } from '@babylon/shared';
import { usePrivy } from '@privy-io/react-auth';
import { Check, Loader2, Search, Shield, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
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
  const [nftGated, setNftGated] = useState(false);
  const [nftContractAddress, setNftContractAddress] = useState('');
  const [nftTokenId, setNftTokenId] = useState<string>('');
  const [nftChainId, setNftChainId] = useState<number | undefined>(undefined);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setGroupName('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
      setError(null);
      setNftGated(false);
      setNftContractAddress('');
      setNftTokenId('');
      setNftChainId(undefined);
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

    if (nftGated && !nftContractAddress.trim()) {
      setError('Contract address required');
      setCreating(false);
      return;
    }

    const token = await getAccessToken();
    const requestBody = {
      name: finalGroupName,
      memberIds: selectedUsers.map((u) => u.id),
      ...(nftGated &&
        nftContractAddress.trim() && {
          requiredNftContractAddress: nftContractAddress.trim(),
          requiredNftTokenId: nftTokenId.trim()
            ? parseInt(nftTokenId.trim(), 10)
            : null,
          requiredNftChainId: nftChainId ?? getCurrentChainId(),
        }),
    };

    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
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

            {/* NFT Gating Section */}
            <div className="mt-6 space-y-4 border-border border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <label className="font-medium text-sm">
                    NFT Gating (Optional)
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNftGated(!nftGated);
                    if (!nftGated) {
                      setNftChainId(getCurrentChainId());
                    } else {
                      setNftContractAddress('');
                      setNftTokenId('');
                      setNftChainId(undefined);
                    }
                  }}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    nftGated ? 'bg-primary' : 'bg-muted'
                  )}
                  disabled={creating}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      nftGated ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {nftGated && (
                <div className="space-y-3 rounded-lg border border-border bg-sidebar p-4">
                  <p className="text-muted-foreground text-xs">
                    Users must hold an NFT from the specified contract to join
                    this group
                  </p>

                  <div>
                    <label className="mb-2 block font-medium text-sm">
                      NFT Contract Address{' '}
                      <span className="font-normal text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={nftContractAddress}
                      onChange={(e) => setNftContractAddress(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none"
                      disabled={creating}
                    />
                    <p className="mt-1 text-muted-foreground text-xs">
                      ERC721 contract address (required)
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block font-medium text-sm">
                      Token ID{' '}
                      <span className="font-normal text-muted-foreground text-xs">
                        (Optional - leave blank for any token from collection)
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="123"
                      value={nftTokenId}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d+$/.test(value)) {
                          setNftTokenId(value);
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm transition-colors focus:border-primary focus:outline-none"
                      disabled={creating}
                    />
                    <p className="mt-1 text-muted-foreground text-xs">
                      Specific token ID, or leave blank to allow any token from
                      the collection
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block font-medium text-sm">
                      Chain
                    </label>
                    <select
                      value={nftChainId ?? getCurrentChainId()}
                      onChange={(e) =>
                        setNftChainId(parseInt(e.target.value, 10))
                      }
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm transition-colors focus:border-primary focus:outline-none"
                      disabled={creating}
                    >
                      <option value={31337}>Local (Hardhat)</option>
                      <option value={84532}>Base Sepolia</option>
                      <option value={8453}>Base Mainnet</option>
                      <option value={1}>Ethereum Mainnet</option>
                      <option value={11155111}>Ethereum Sepolia</option>
                    </select>
                    <p className="mt-1 text-muted-foreground text-xs">
                      Blockchain network for the NFT contract
                    </p>
                  </div>

                  {nftContractAddress.trim() && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                      <p className="text-blue-700 text-xs dark:text-blue-300">
                        <strong>NFT Requirement:</strong>{' '}
                        {nftTokenId.trim()
                          ? `Token #${nftTokenId.trim()} from ${nftContractAddress.slice(0, 6)}...${nftContractAddress.slice(-4)}`
                          : `Any token from ${nftContractAddress.slice(0, 6)}...${nftContractAddress.slice(-4)}`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
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
