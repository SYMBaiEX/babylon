/**
 * Mute user modal component for muting users.
 *
 * Provides a confirmation modal for muting users. Shows what muting
 * will do (hides posts but maintains follow relationship). Includes
 * optional reason field. Handles API call and success/error states.
 *
 * Features:
 * - Confirmation dialog
 * - Muting behavior explanation
 * - Optional reason field
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 *
 * @param props - MuteUserModal component props
 * @returns Mute user modal element or null if not open
 *
 * @example
 * ```tsx
 * <MuteUserModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   targetUserId="user-123"
 *   targetDisplayName="Alice"
 *   onSuccess={() => refreshFeed()}
 * />
 * ```
 */
'use client';

import { VolumeX, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface MuteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetDisplayName: string;
  isNPC?: boolean;
  onSuccess?: () => void;
}

export function MuteUserModal({
  isOpen,
  onClose,
  targetUserId,
  targetDisplayName,
  isNPC: _isNPC,
  onSuccess,
}: MuteUserModalProps) {
  const [reason, setReason] = useState('');
  const [isMuting, startMuting] = useTransition();

  const handleMute = () => {
    startMuting(async () => {
      const response = await fetch(`/api/users/${targetUserId}/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mute',
          reason: reason || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.message || 'Failed to mute user');
        return;
      }

      toast.success(`Muted ${targetDisplayName}`);
      onClose();
      onSuccess?.();
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold text-xl">
            <VolumeX className="h-5 w-5 text-blue-500" />
            Mute User
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-muted-foreground">
          Are you sure you want to mute <strong>{targetDisplayName}</strong>?
        </p>

        <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-muted-foreground text-sm">Muting will:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground text-sm">
            <li>Hide their posts from your feed</li>
            <li>You'll remain followers (if applicable)</li>
            <li>They won't be notified</li>
            <li>You can unmute them anytime</li>
          </ul>
        </div>

        <div className="mb-4">
          <label className="mb-2 block font-medium text-sm">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you muting this user?"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 focus:border-primary focus:outline-none"
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isMuting}
            className="flex-1 rounded-lg bg-muted px-4 py-2 text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMute}
            disabled={isMuting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {isMuting ? (
              <>Muting...</>
            ) : (
              <>
                <VolumeX className="h-4 w-4" />
                Mute User
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
