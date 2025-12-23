'use client';

import { cn } from '@babylon/shared';
import { Bot, Check, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAgentUsernameCheck } from '../hooks/useAgentUsernameCheck';

interface AgentNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (displayName: string, username: string) => void;
}

/**
 * Modal for entering agent name and username before creation
 * Similar to user onboarding profile modal
 */
export function AgentNameModal({
  isOpen,
  onClose,
  onSubmit,
}: AgentNameModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  const { usernameStatus, usernameSuggestion, isCheckingUsername } =
    useAgentUsernameCheck(username);

  // Auto-generate username from display name
  useEffect(() => {
    if (displayName && !username) {
      const generated = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 20);
      setUsername(generated);
    }
  }, [displayName, username]);

  const handleDisplayNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newName = e.target.value;
      setDisplayName(newName);

      // Auto-update username only if it hasn't been manually edited
      // or if it matches the auto-generated pattern from previous name
      const currentGenerated = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 20);

      if (!username || username === currentGenerated) {
        const newGenerated = newName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .substring(0, 20);
        setUsername(newGenerated);
      }
    },
    [displayName, username]
  );

  const handleUsernameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      setUsername(value);
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!displayName.trim()) {
        return;
      }

      if (!username.trim() || username.length < 3) {
        return;
      }

      if (usernameStatus !== 'available') {
        return;
      }

      onSubmit(displayName.trim(), username.trim());
    },
    [displayName, username, usernameStatus, onSubmit]
  );

  const handleUseSuggestion = useCallback(() => {
    if (usernameSuggestion) {
      setUsername(usernameSuggestion);
    }
  }, [usernameSuggestion]);

  const isSubmitDisabled =
    !displayName.trim() ||
    !username.trim() ||
    username.length < 3 ||
    usernameStatus !== 'available' ||
    isCheckingUsername;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4">
        <div
          className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-border border-b p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-lg">
                  Name Your Agent
                </h2>
                <p className="text-muted-foreground text-sm">
                  Choose a name and username for your agent
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-5">
              {/* Display Name */}
              <div>
                <label
                  htmlFor="agent-displayName"
                  className="mb-2 block font-medium text-sm"
                >
                  Display Name *
                </label>
                <input
                  id="agent-displayName"
                  type="text"
                  value={displayName}
                  onChange={handleDisplayNameChange}
                  placeholder="My Trading Bot"
                  maxLength={50}
                  className={cn(
                    'w-full rounded-lg border border-border bg-muted px-4 py-3',
                    'focus:outline-none focus:ring-2 focus:ring-primary',
                    'placeholder:text-muted-foreground/50'
                  )}
                  autoFocus
                />
                <p className="mt-1.5 text-muted-foreground text-xs">
                  This is how your agent will appear to others
                </p>
              </div>

              {/* Username */}
              <div>
                <label
                  htmlFor="agent-username"
                  className="mb-2 block font-medium text-sm"
                >
                  Username *
                </label>
                <div className="relative">
                  <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground">
                    @
                  </span>
                  <input
                    id="agent-username"
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="my_trading_bot"
                    maxLength={30}
                    className={cn(
                      'w-full rounded-lg border border-border bg-muted py-3 pr-10 pl-8',
                      'focus:outline-none focus:ring-2 focus:ring-primary',
                      'placeholder:text-muted-foreground/50',
                      usernameStatus === 'taken' && 'border-red-500',
                      usernameStatus === 'available' && 'border-green-500'
                    )}
                  />
                  {/* Status indicator */}
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    {isCheckingUsername && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!isCheckingUsername && usernameStatus === 'available' && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!isCheckingUsername && usernameStatus === 'taken' && (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>

                {/* Suggestion */}
                {usernameStatus === 'taken' && usernameSuggestion && (
                  <p className="mt-1.5 text-muted-foreground text-xs">
                    Username taken. Try:{' '}
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      className="text-primary underline hover:text-primary/80"
                    >
                      {usernameSuggestion}
                    </button>
                  </p>
                )}

                {username && username.length < 3 && (
                  <p className="mt-1.5 text-red-500 text-xs">
                    Username must be at least 3 characters
                  </p>
                )}

                <p className="mt-1.5 text-muted-foreground text-xs">
                  3-30 characters. Letters, numbers, underscores, and hyphens
                  only.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'flex-1 rounded-lg border border-border px-4 py-3 font-medium',
                  'transition-colors hover:bg-muted'
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className={cn(
                  'flex-1 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground',
                  'transition-colors hover:bg-primary/90',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

