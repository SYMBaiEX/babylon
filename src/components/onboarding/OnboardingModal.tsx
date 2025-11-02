'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OnboardingModalProps {
  isOpen: boolean
  onComplete: (username: string) => void
  onSkip: () => void
}

// Generate a random username
function generateRandomUsername(): string {
  const adjectives = ['cool', 'swift', 'bright', 'smart', 'bold', 'lucky', 'brave', 'wise', 'keen', 'rapid']
  const nouns = ['wolf', 'eagle', 'fox', 'lion', 'tiger', 'hawk', 'bear', 'raven', 'panther', 'falcon']
  const randomNum = Math.floor(Math.random() * 10000)
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj}_${noun}_${randomNum}`
}

export function OnboardingModal({ isOpen, onComplete, onSkip }: OnboardingModalProps) {
  const [username, setUsername] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate a random username on mount
  useEffect(() => {
    if (isOpen && !username) {
      setUsername(generateRandomUsername())
    }
  }, [isOpen, username])

  const handleGenerate = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setUsername(generateRandomUsername())
      setIsGenerating(false)
    }, 200)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate username
    if (!username.trim()) {
      setError('Please enter a username or generate one')
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (username.length > 20) {
      setError('Username must be 20 characters or less')
      return
    }

    // Only allow alphanumeric and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      return
    }

    onComplete(username.trim())
  }

  const handleSkip = () => {
    // Generate a random username if skipping
    const randomUsername = generateRandomUsername()
    onSkip()
    // Still complete with random username
    onComplete(randomUsername)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[100] backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div
          className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#1c9cf0]/10 rounded-lg">
                <Sparkles className="w-6 h-6 text-[#1c9cf0]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Welcome to Babylon!</h2>
                <p className="text-sm text-muted-foreground">Let's set up your profile</p>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2">
                Choose your username
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setError(null)
                    }}
                    placeholder="username"
                    className={cn(
                      'w-full pl-8 pr-3 py-2 bg-muted border rounded-lg',
                      'focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]',
                      error ? 'border-red-500' : 'border-border'
                    )}
                    maxLength={20}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={cn(
                    'px-4 py-2 bg-muted hover:bg-muted/70 rounded-lg',
                    'text-sm font-medium transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isGenerating ? '...' : '🎲'}
                </button>
              </div>
              {error && (
                <p className="text-sm text-red-500 mt-1">{error}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                3-20 characters, letters, numbers, and underscores only
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                onClick={handleSkip}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/70 rounded-lg font-medium transition-colors"
              >
                Use Random
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-[#1c9cf0] hover:bg-[#1a8cd8] text-white rounded-lg font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </form>

          {/* Info */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg flex items-start gap-3">
            <User className="w-5 h-5 text-[#1c9cf0] flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Why set a username?</p>
              <p>Your username is your unique identity on Babylon. It's used in your referral link and appears on all your posts and comments.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

