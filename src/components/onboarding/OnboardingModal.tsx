'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, RefreshCw, Upload, Check, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { logger } from '@/lib/logger'

interface OnboardingModalProps {
  isOpen: boolean
  onComplete: (data: OnboardingData) => void
  onSkip: () => void
}

interface OnboardingData {
  username: string
  displayName: string
  bio: string
  profileImageUrl?: string
  coverImageUrl?: string
}

interface ProfileData {
  name: string
  username: string
  bio: string
}

const TOTAL_PROFILE_PICTURES = 100
const TOTAL_BANNERS = 100

export function OnboardingModal({ isOpen, onComplete, onSkip: _onSkip }: OnboardingModalProps) {
  // Profile data
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  
  // Image indices (1-based)
  const [profilePictureIndex, setProfilePictureIndex] = useState(1)
  const [bannerIndex, setBannerIndex] = useState(1)
  
  // Upload state
  const [uploadedProfileImage, setUploadedProfileImage] = useState<string | null>(null)
  const [uploadedBanner, setUploadedBanner] = useState<string | null>(null)
  
  // UI state
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'available' | 'taken' | null>(null)
  const [usernameSuggestion, setUsernameSuggestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize with AI-generated data
  useEffect(() => {
    if (isOpen && !displayName) {
      initializeProfile()
    }
  }, [isOpen, displayName])

  // Check username availability when it changes
  useEffect(() => {
    if (username && username.length >= 3) {
      checkUsernameAvailability(username)
    } else {
      setUsernameStatus(null)
      setUsernameSuggestion(null)
    }
  }, [username])

  async function initializeProfile() {
    setIsLoading(true)
    try {
      // Generate profile data and random asset indices in parallel
      const [profileRes, assetsRes] = await Promise.all([
        fetch('/api/onboarding/generate-profile'),
        fetch('/api/onboarding/random-assets')
      ])

      if (profileRes.ok && assetsRes.ok) {
        const profileData: ProfileData = (await profileRes.json()).data
        const assetsData = (await assetsRes.json()).data

        setDisplayName(profileData.name)
        setUsername(profileData.username)
        setBio(profileData.bio)
        setProfilePictureIndex(assetsData.profilePictureIndex)
        setBannerIndex(assetsData.bannerIndex)
      }
    } catch (error) {
      logger.error('Failed to initialize profile', error, 'OnboardingModal')
    } finally {
      setIsLoading(false)
    }
  }

  async function regenerateProfile() {
    setIsGenerating(true)
    try {
      const response = await fetch('/api/onboarding/generate-profile')
      if (response.ok) {
        const profileData: ProfileData = (await response.json()).data
        setDisplayName(profileData.name)
        setUsername(profileData.username)
        setBio(profileData.bio)
      }
    } catch (error) {
      logger.error('Failed to regenerate profile', error, 'OnboardingModal')
    } finally {
      setIsGenerating(false)
    }
  }

  async function checkUsernameAvailability(username: string) {
    setIsCheckingUsername(true)
    setUsernameSuggestion(null)
    try {
      const response = await fetch(`/api/onboarding/check-username?username=${encodeURIComponent(username)}`)
      if (response.ok) {
        const result = (await response.json()).data
        setUsernameStatus(result.available ? 'available' : 'taken')
        if (!result.available && result.suggestion) {
          setUsernameSuggestion(result.suggestion)
        }
      }
    } catch (error) {
      logger.error('Failed to check username', error, 'OnboardingModal')
    } finally {
      setIsCheckingUsername(false)
    }
  }

  function cycleProfilePicture(direction: 'next' | 'prev') {
    setUploadedProfileImage(null) // Clear uploaded image
    setProfilePictureIndex(prev => {
      if (direction === 'next') {
        return prev >= TOTAL_PROFILE_PICTURES ? 1 : prev + 1
      } else {
        return prev <= 1 ? TOTAL_PROFILE_PICTURES : prev - 1
      }
    })
  }

  function cycleBanner(direction: 'next' | 'prev') {
    setUploadedBanner(null) // Clear uploaded banner
    setBannerIndex(prev => {
      if (direction === 'next') {
        return prev >= TOTAL_BANNERS ? 1 : prev + 1
      } else {
        return prev <= 1 ? TOTAL_BANNERS : prev - 1
      }
    })
  }

  function handleProfileImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setUploadedProfileImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setUploadedBanner(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate
    if (!displayName.trim()) {
      setError('Please enter a display name')
      return
    }

    if (!username.trim()) {
      setError('Please enter a username')
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

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      return
    }

    if (usernameStatus === 'taken') {
      setError('Username is already taken. Please choose another.')
      return
    }

    // Build profile image URL
    let profileImageUrl = undefined
    if (uploadedProfileImage) {
      profileImageUrl = uploadedProfileImage
    } else {
      profileImageUrl = `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
    }

    // Build banner URL
    let coverImageUrl = undefined
    if (uploadedBanner) {
      coverImageUrl = uploadedBanner
    } else {
      coverImageUrl = `/assets/user-banners/banner-${bannerIndex}.jpg`
    }

    onComplete({
      username: username.trim(),
      displayName: displayName.trim(),
      bio: bio.trim(),
      profileImageUrl,
      coverImageUrl,
    })
  }

  function handleSkip() {
    // Use current generated data
    onComplete({
      username: username || `user_${Math.random().toString(36).substring(2, 10)}`,
      displayName: displayName || 'New User',
      bio: bio || 'Just joined Babylon!',
      profileImageUrl: `/assets/user-profiles/profile-${profilePictureIndex}.jpg`,
      coverImageUrl: `/assets/user-banners/banner-${bannerIndex}.jpg`,
    })
  }

  if (!isOpen) return null

  const currentProfileImage = uploadedProfileImage || `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
  const currentBanner = uploadedBanner || `/assets/user-banners/banner-${bannerIndex}.jpg`

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[100] backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
        <div
          className="bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#1c9cf0]/10 rounded-lg">
                <Sparkles className="w-6 h-6 text-[#1c9cf0]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Welcome to Babylon!</h2>
                <p className="text-sm text-muted-foreground">Set up your AI-powered profile</p>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <RefreshCw className="w-8 h-8 text-[#1c9cf0] animate-spin" />
              <p className="text-muted-foreground">Generating your profile...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Banner */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Profile Banner</label>
                <div className="relative h-40 bg-muted rounded-lg overflow-hidden group">
                  <Image
                    src={currentBanner}
                    alt="Profile banner"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  
                  {/* Banner controls */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => cycleBanner('prev')}
                      className="p-2 bg-background/80 hover:bg-background rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    
                    <label className="p-2 bg-background/80 hover:bg-background rounded-lg transition-colors cursor-pointer">
                      <Upload className="w-5 h-5" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerUpload}
                        className="hidden"
                      />
                    </label>
                    
                    <button
                      type="button"
                      onClick={() => cycleBanner('next')}
                      className="p-2 bg-background/80 hover:bg-background rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click arrows to browse or upload your own
                </p>
              </div>

              {/* Profile Picture */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Profile Picture</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted group">
                    <Image
                      src={currentProfileImage}
                      alt="Profile picture"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    
                    {/* Profile picture controls */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <label className="p-2 bg-background/80 hover:bg-background rounded-lg transition-colors cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfileImageUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => cycleProfilePicture('prev')}
                      className="p-2 bg-muted hover:bg-muted/70 rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cycleProfilePicture('next')}
                      className="p-2 bg-muted hover:bg-muted/70 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <p className="text-xs text-muted-foreground flex-1">
                    Browse through {TOTAL_PROFILE_PICTURES} AI-generated images or upload your own
                  </p>
                </div>
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <label htmlFor="displayName" className="block text-sm font-medium">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]"
                  maxLength={50}
                />
              </div>

              {/* Username */}
              <div className="space-y-2">
                <label htmlFor="username" className="block text-sm font-medium">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                      setError(null)
                    }}
                    placeholder="username"
                    className={cn(
                      'w-full pl-8 pr-10 py-2 bg-muted border rounded-lg',
                      'focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]',
                      error ? 'border-red-500' : 'border-border',
                      usernameStatus === 'available' && 'border-green-500',
                      usernameStatus === 'taken' && 'border-yellow-500'
                    )}
                    maxLength={20}
                  />
                  
                  {/* Username status indicator */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isCheckingUsername && (
                      <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
                    )}
                    {!isCheckingUsername && usernameStatus === 'available' && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                    {!isCheckingUsername && usernameStatus === 'taken' && (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    )}
                  </div>
                </div>
                
                {usernameSuggestion && (
                  <button
                    type="button"
                    onClick={() => setUsername(usernameSuggestion)}
                    className="text-xs text-[#1c9cf0] hover:underline"
                  >
                    Try @{usernameSuggestion} instead?
                  </button>
                )}
                
                <p className="text-xs text-muted-foreground">
                  3-20 characters, letters, numbers, and underscores only
                </p>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <label htmlFor="bio" className="block text-sm font-medium">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0] resize-none"
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/160
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={regenerateProfile}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-muted hover:bg-muted/70 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={cn('w-4 h-4', isGenerating && 'animate-spin')} />
                  Regenerate
                </button>
                
                <button
                  type="button"
                  onClick={handleSkip}
                  className="flex-1 px-4 py-2 bg-muted hover:bg-muted/70 rounded-lg font-medium transition-colors"
                >
                  Skip for Now
                </button>
                
                <button
                  type="submit"
                  disabled={isCheckingUsername || usernameStatus === 'taken'}
                  className="flex-1 px-4 py-2 bg-[#1c9cf0] hover:bg-[#1a8cd8] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Complete Setup
                </button>
              </div>
            </form>
          )}

          {/* Info */}
          <div className="px-6 pb-6">
            <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#1c9cf0] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">AI-Powered Setup</p>
                <p>We've pre-generated everything for you! Just click through or customize to your liking. You can change everything later in settings.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
