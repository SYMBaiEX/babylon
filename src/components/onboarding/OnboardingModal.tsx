'use client'

import { useState, useEffect } from 'react'
import { OnboardingStatus } from '@prisma/client'
import { X, Sparkles, RefreshCw, Upload, Check, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api/fetch'
import type { OnboardingIntentResponse, OnboardingProfilePayload } from '@/lib/services/onboarding-service'

interface OnboardingModalProps {
  isOpen: boolean
  status: OnboardingStatus
  intent: OnboardingIntentResponse
  isSubmitting: boolean
  error?: string | null
  onSubmitProfile: (payload: OnboardingProfilePayload) => Promise<void>
  onStartOnchain: () => Promise<void>
  onClose: () => void
}

interface GeneratedProfile {
  name: string
  username: string
  bio: string
}

const TOTAL_PROFILE_PICTURES = 100
const TOTAL_BANNERS = 100
const ABSOLUTE_URL_PATTERN = /^(https?:|data:|blob:)/i

function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  if (ABSOLUTE_URL_PATTERN.test(value)) {
    return value
  }
  if (typeof window !== 'undefined' && value.startsWith('/')) {
    return new URL(value, window.location.origin).toString()
  }
  return value
}

export function OnboardingModal({
  isOpen,
  status,
  intent,
  isSubmitting,
  error,
  onSubmitProfile,
  onStartOnchain,
  onClose,
}: OnboardingModalProps) {
  const profileDefaults = intent.profile

  const [displayName, setDisplayName] = useState(profileDefaults?.displayName ?? '')
  const [username, setUsername] = useState(profileDefaults?.username ?? '')
  const [bio, setBio] = useState(profileDefaults?.bio ?? '')
  const [profilePictureIndex, setProfilePictureIndex] = useState(1)
  const [bannerIndex, setBannerIndex] = useState(1)
  const [uploadedProfileImage, setUploadedProfileImage] = useState<string | null>(null)
  const [uploadedBanner, setUploadedBanner] = useState<string | null>(null)
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'available' | 'taken' | null>(null)
  const [usernameSuggestion, setUsernameSuggestion] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!profileDefaults)

  const currentProfileImage = uploadedProfileImage || profileDefaults?.profileImageUrl || `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
  const currentBanner = uploadedBanner || profileDefaults?.coverImageUrl || `/assets/user-banners/banner-${bannerIndex}.jpg`

  useEffect(() => {
    if (!isOpen) return

    if (profileDefaults) {
      setDisplayName(profileDefaults.displayName ?? '')
      setUsername(profileDefaults.username ?? '')
      setBio(profileDefaults.bio ?? '')
      if (profileDefaults.profileImageUrl?.includes('/assets/user-profiles/profile-')) {
        const indexMatch = profileDefaults.profileImageUrl.match(/profile-(\d+)\.jpg$/)
        if (indexMatch) {
          setProfilePictureIndex(Number(indexMatch[1]))
        }
      }
      if (profileDefaults.coverImageUrl?.includes('/assets/user-banners/banner-')) {
        const indexMatch = profileDefaults.coverImageUrl.match(/banner-(\d+)\.jpg$/)
        if (indexMatch) {
          setBannerIndex(Number(indexMatch[1]))
        }
      }
      setUploadedProfileImage(null)
      setUploadedBanner(null)
      setIsLoading(false)
    } else {
      void initializeProfile()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, intent.intentId])

  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameStatus(null)
      setUsernameSuggestion(null)
      return
    }

    let cancelled = false
    const checkUsername = async () => {
      setIsCheckingUsername(true)
      const response = await apiFetch(`/api/onboarding/check-username?username=${encodeURIComponent(username)}`, { auth: false })
      if (!cancelled && response.ok) {
        const result = (await response.json()).data as { available: boolean; suggestion?: string }
        setUsernameStatus(result.available ? 'available' : 'taken')
        setUsernameSuggestion(result.available ? null : result.suggestion ?? null)
      }
      setIsCheckingUsername(false)
    }

    void checkUsername()
    return () => {
      cancelled = true
    }
  }, [username])

  async function initializeProfile() {
    setIsLoading(true)
    const [profileRes, assetsRes] = await Promise.all([
      apiFetch('/api/onboarding/generate-profile', { auth: false }),
      apiFetch('/api/onboarding/random-assets', { auth: false }),
    ])

    if (profileRes.ok && assetsRes.ok) {
      const profileData = (await profileRes.json()).data as GeneratedProfile
      const assetsData = (await assetsRes.json()).data as { profilePictureIndex: number; bannerIndex: number }

      setDisplayName(profileData.name)
      setUsername(profileData.username)
      setBio(profileData.bio)
      setProfilePictureIndex(assetsData.profilePictureIndex)
      setBannerIndex(assetsData.bannerIndex)
    }
    setIsLoading(false)
  }

  function cycleProfilePicture(direction: 'next' | 'prev') {
    setUploadedProfileImage(null)
    setProfilePictureIndex(prev => {
      if (direction === 'next') {
        return prev >= TOTAL_PROFILE_PICTURES ? 1 : prev + 1
      }
      return prev <= 1 ? TOTAL_PROFILE_PICTURES : prev - 1
    })
  }

  function cycleBanner(direction: 'next' | 'prev') {
    setUploadedBanner(null)
    setBannerIndex(prev => {
      if (direction === 'next') {
        return prev >= TOTAL_BANNERS ? 1 : prev + 1
      }
      return prev <= 1 ? TOTAL_BANNERS : prev - 1
    })
  }

  function handleProfileImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedProfileImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedBanner(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting || status !== 'PENDING_PROFILE') return

    setFormError(null)

    if (!displayName.trim()) {
      setFormError('Please enter a display name')
      return
    }
    if (!username.trim()) {
      setFormError('Please enter a username')
      return
    }
    if (username.length < 3) {
      setFormError('Username must be at least 3 characters')
      return
    }
    if (username.length > 20) {
      setFormError('Username must be 20 characters or less')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setFormError('Username can only contain letters, numbers, and underscores')
      return
    }
    if (usernameStatus === 'taken') {
      setFormError('Username is already taken. Please choose another.')
      return
    }

    const profileImageSource =
      uploadedProfileImage ??
      profileDefaults?.profileImageUrl ??
      `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
    const coverImageSource =
      uploadedBanner ??
      profileDefaults?.coverImageUrl ??
      `/assets/user-banners/banner-${bannerIndex}.jpg`

    const payload: OnboardingProfilePayload = {
      username: username.trim().toLowerCase(),
      displayName: displayName.trim(),
      bio: bio.trim() || undefined,
      profileImageUrl: resolveAssetUrl(profileImageSource),
      coverImageUrl: resolveAssetUrl(coverImageSource),
    }

    await onSubmitProfile(payload)
  }

  function handleSkip() {
    if (status !== 'PENDING_PROFILE' || isSubmitting) return
    const profileImageSource =
      uploadedProfileImage ?? `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
    const coverImageSource = uploadedBanner ?? `/assets/user-banners/banner-${bannerIndex}.jpg`

    const payload: OnboardingProfilePayload = {
      username: username || `user_${Math.random().toString(36).substring(2, 10)}`,
      displayName: displayName || 'New User',
      bio: bio || 'Just joined Babylon!',
      profileImageUrl: resolveAssetUrl(profileImageSource),
      coverImageUrl: resolveAssetUrl(coverImageSource),
    }
    void onSubmitProfile(payload)
  }

  if (!isOpen) return null

  const renderContent = () => {
    if (status === 'COMPLETED') {
      return (
        <div className="p-12 flex flex-col items-center gap-4">
          <Check className="w-10 h-10 text-[#1c9cf0]" />
          <p className="text-lg font-semibold">Onboarding complete! Enjoy Babylon 🎉</p>
          <button
            type="button"
            className="px-4 py-2 bg-[#1c9cf0] text-white rounded-lg"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      )
    }

    if (status === 'PENDING_ONCHAIN' || status === 'ONCHAIN_IN_PROGRESS') {
      return (
        <div className="p-12 flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-[#1c9cf0] animate-spin" />
          <p className="text-lg font-semibold text-center">
            Finalising on-chain registration...
          </p>
          <p className="text-sm text-muted-foreground text-center">
            This may take a few moments. You can keep this window open or continue browsing.
          </p>
        </div>
      )
    }

    if (status === 'ONCHAIN_FAILED') {
      return (
        <div className="p-12 flex flex-col items-center gap-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <p className="text-lg font-semibold text-center">
            On-chain registration failed. You can retry or contact support.
          </p>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <button
            type="button"
            className="px-4 py-2 bg-[#1c9cf0] text-white rounded-lg disabled:opacity-50"
            disabled={isSubmitting}
            onClick={onStartOnchain}
          >
            Retry on-chain step
          </button>
        </div>
      )
    }

    // Default: PENDING_PROFILE form
    return (
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
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button type="button" onClick={() => cycleBanner('prev')} className="p-2 bg-background/80 hover:bg-background rounded-lg">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <label className="p-2 bg-background/80 hover:bg-background rounded-lg cursor-pointer">
                <Upload className="w-5 h-5" />
                <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
              </label>
              <button type="button" onClick={() => cycleBanner('next')} className="p-2 bg-background/80 hover:bg-background rounded-lg">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Click arrows to browse or upload your own</p>
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
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <label className="p-2 bg-background/80 hover:bg-background rounded-lg cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept="image/*" onChange={handleProfileImageUpload} className="hidden" />
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => cycleProfilePicture('prev')} className="p-2 bg-muted hover:bg-muted/70 rounded-lg">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => cycleProfilePicture('next')} className="p-2 bg-muted hover:bg-muted/70 rounded-lg">
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
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your handle"
              className="w-full pl-8 pr-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]"
              maxLength={20}
            />
            {isCheckingUsername && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {usernameStatus === 'available' && !isCheckingUsername && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
            )}
            {usernameStatus === 'taken' && !isCheckingUsername && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            )}
          </div>
          {usernameStatus === 'taken' && usernameSuggestion && (
            <p className="text-xs text-muted-foreground">
              Suggestion: <button type="button" className="underline" onClick={() => setUsername(usernameSuggestion!)}>{usernameSuggestion}</button>
            </p>
          )}
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
            placeholder="Tell the world who you are"
            rows={3}
            maxLength={280}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]"
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/280</p>
        </div>

        {(formError || error) && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{formError || error}</span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={handleSkip}
            disabled={isSubmitting}
          >
            Skip for now
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 bg-muted rounded-lg"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={cn(
                'px-4 py-2 bg-[#1c9cf0] text-white rounded-lg flex items-center gap-2',
                isSubmitting && 'opacity-60'
              )}
              disabled={isSubmitting}
            >
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving...' : 'Continue'}
            </button>
          </div>
        </div>
      </form>
    )
  }

  const canClose = status === OnboardingStatus.COMPLETED

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 z-[100] backdrop-blur-sm"
        onClick={canClose ? onClose : undefined}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
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
              onClick={canClose ? onClose : undefined}
              className="p-2 hover:bg-muted rounded-lg disabled:opacity-50"
              disabled={!canClose}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {isLoading ? (
            <div className="p-12 flex flex-col items-center gap-4">
              <RefreshCw className="w-8 h-8 text-[#1c9cf0] animate-spin" />
              <p className="text-muted-foreground">Generating your profile...</p>
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </>
  )
}
