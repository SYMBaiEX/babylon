'use client'

import { useState } from 'react'
import { MessageCircle, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewDMDialogProps {
  onCreateDM: (userId: string) => Promise<void>
  isOpen: boolean
  onClose: () => void
}

// Default users that can be DMed
const DEFAULT_DM_TARGETS = [
  {
    id: 'demo-user-babylon-support',
    username: 'babylon-support',
    displayName: 'Babylon Support',
    bio: 'Official Babylon support account',
  },
  {
    id: 'demo-user-welcome-bot',
    username: 'welcome-bot',
    displayName: 'Welcome Bot',
    bio: 'New to Babylon? Message me to learn how to play!',
  },
]

export function NewDMDialog({ onCreateDM, isOpen, onClose }: NewDMDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateDM = async (userId: string) => {
    setLoading(true)
    setError(null)
    try {
      await onCreateDM(userId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create DM')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-background rounded-lg shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">New Direct Message</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Select a user to start a direct message:
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {DEFAULT_DM_TARGETS.map((target) => (
              <button
                key={target.id}
                onClick={() => handleCreateDM(target.id)}
                disabled={loading}
                className={cn(
                  'w-full p-3 rounded-lg text-left transition-colors',
                  'bg-sidebar-accent/30 hover:bg-sidebar-accent/50',
                  'border border-sidebar-accent',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground">
                      {target.displayName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{target.username}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {target.bio}
                    </div>
                  </div>
                  {loading && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-sidebar-accent/20 border border-sidebar-accent">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> You can send direct messages to other real players you meet in the game!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-sidebar-accent/50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

