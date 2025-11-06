'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Sparkles, RefreshCw, Upload, Check, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api/fetch'
import type { OnboardingProfilePayload } from '@/lib/onboarding/types'
import { logger } from '@/lib/logger'

interface OnboardingModalProps {
  isOpen: boolean
  stage: 'PROFILE' | 'ONCHAIN' | 'COMPLETED'
  isSubmitting: boolean
  error?: string | null
  onSubmitProfile: (payload: OnboardingProfilePayload) => Promise<void>
  onRetryOnchain: () => Promise<void>
  onClose: () => void
}

interface GeneratedProfileResponse {
  name: string
  username: string
  bio: string
}

interface RandomAssetsResponse {
  profilePictureIndex: number
  bannerIndex: number
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
  stage,
  isSubmitting,
  error,
  onSubmitProfile,
  onRetryOnchain,
  onClose,
}: OnboardingModalProps) {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [profilePictureIndex, setProfilePictureIndex] = useState(1)
  const [bannerIndex, setBannerIndex] = useState(1)
  const [uploadedProfileImage, setUploadedProfileImage] = useState<string | null>(null)
  const [uploadedBanner, setUploadedBanner] = useState<string | null>(null)
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'available' | 'taken' | null>(null)
  const [usernameSuggestion, setUsernameSuggestion] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true)

  const currentProfileImage = useMemo(() => {
    return uploadedProfileImage || `/assets/user-profiles/profile-${profilePictureIndex}.jpg`
  }, [uploadedProfileImage, profilePictureIndex])

  const currentBanner = useMemo(() => {
    return uploadedBanner || `/assets/user-banners/banner-${bannerIndex}.jpg`
  }, [uploadedBanner, bannerIndex])

  useEffect(() => {
    if (!isOpen) return

    const initializeProfile = async () => {
      setIsLoadingDefaults(true)

      try {
        const [profileResult, assetsResult] = await Promise.allSettled([
          apiFetch('/api/onboarding/generate-profile', { auth: false }),
          apiFetch('/api/onboarding/random-assets', { auth: false }),
        ])

        if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
          const generated = (await profileResult.value.json()) as GeneratedProfileResponse
          setDisplayName(generated.name)
          setUsername(generated.username)
          setBio(generated.bio)
        } else {
          setDisplayName('New Babylonian')
          setUsername(`user_${Math.random().toString(36).slice(2, 10)}`)
          setBio('Just joined Babylon!')
        }

        if (assetsResult.status === 'fulfilled' && assetsResult.value.ok) {
          const assets = (await assetsResult.value.json()) as RandomAssetsResponse
          setProfilePictureIndex(assets.profilePictureIndex)
          setBannerIndex(assets.bannerIndex)
        } else {
          setProfilePictureIndex(Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1)
          setBannerIndex(Math.floor(Math.random() * TOTAL_BANNERS) + 1)
        }
      } catch (initError) {
        logger.warn('Failed to initialize onboarding defaults', { error: initError }, 'OnboardingModal')
        setDisplayName('New Babylonian')
        setUsername(`user_${Math.random().toString(36).slice(2, 10)}`)
        setBio('Just joined Babylon!')
        setProfilePictureIndex(Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1)
        setBannerIndex(Math.floor(Math.random() * TOTAL_BANNERS) + 1)
      } finally {
        setUploadedProfileImage(null)
        setUploadedBanner(null)
        setIsLoadingDefaults(false)
      }
    }

    void initializeProfile()
  }, [isOpen])

  useEffect(() => {
    if (stage !== 'PROFILE') return
    if (!username || username.length < 3) {
      setUsernameStatus(null)
      setUsernameSuggestion(null)
      return
    }

    let cancelled = false

    const checkUsername = async () => {
      setIsCheckingUsername(true)
      let status: 'available' | 'taken' | null = null
      let suggestion: string | null = null

      try {
        const response = await apiFetch(`/api/onboarding/check-username?username=${encodeURIComponent(username)}`, { auth: false })
        if (response.ok) {
          const result = (await response.json()) as { available?: boolean; suggestion?: string }
          status = result.available ? 'available' : 'taken'
          suggestion = result.available ? null : result.suggestion ?? null
        } else {
          const body = await response.json().catch(() => null)
          logger.warn('Username availability check failed', { status: response.status, body }, 'OnboardingModal')
        }
      } catch (checkError) {
        logger.warn('Username availability check error', { error: checkError }, 'OnboardingModal')
      }

      if (!cancelled) {
        setUsernameStatus(status)
        setUsernameSuggestion(suggestion)
        setIsCheckingUsername(false)
      }
    }

    void checkUsername()

    return () => {
      cancelled = true
    }
  }, [username, stage])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (stage !== 'PROFILE' || isSubmitting) return

    setFormError(null)

    if (!displayName.trim()) {
      setFormError('Please enter a display name')
      return
    }

    if (!username.trim() || username.length < 3) {
      setFormError('Please pick a username of at least 3 characters')
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

    const profilePayload: OnboardingProfilePayload = {
      username: username.trim().toLowerCase(),
      displayName: displayName.trim(),
      bio: bio.trim() || undefined,
      profileImageUrl: resolveAssetUrl(uploadedProfileImage ?? `/assets/user-profiles/profile-${profilePictureIndex}.jpg`),
      coverImageUrl: resolveAssetUrl(uploadedBanner ?? `/assets/user-banners/banner-${bannerIndex}.jpg`),
    }

    await onSubmitProfile(profilePayload)
  }

  const renderProfileForm = () => (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
            Suggestion:{' '}
            <button type="button" className="underline" onClick={() => setUsername(usernameSuggestion)}>
              {usernameSuggestion}
            </button>
          </p>
        )}
      </div>

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
            disabled={isSubmitting}
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

  const cycleProfilePicture = (direction: 'next' | 'prev') => {
    setUploadedProfileImage(null)
    setProfilePictureIndex((prev) => {
      if (direction === 'next') {
        return prev >= TOTAL_PROFILE_PICTURES ? 1 : prev + 1
      }
      return prev <= 1 ? TOTAL_PROFILE_PICTURES : prev - 1
    })
  }

  const cycleBanner = (direction: 'next' | 'prev') => {
    setUploadedBanner(null)
    setBannerIndex((prev) => {
      if (direction === 'next') {
        return prev >= TOTAL_BANNERS ? 1 : prev + 1
      }
      return prev <= 1 ? TOTAL_BANNERS : prev - 1
    })
  }

  const handleProfileImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedProfileImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleBannerUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setUploadedBanner(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSkip = () => {
    if (stage !== 'PROFILE' || isSubmitting) return

    const profilePayload: OnboardingProfilePayload = {
      username: username || `user_${Math.random().toString(36).substring(2, 10)}`,
      displayName: displayName || 'New User',
      bio: bio || 'Just joined Babylon!',
      profileImageUrl: resolveAssetUrl(uploadedProfileImage ?? `/assets/user-profiles/profile-${profilePictureIndex}.jpg`),
      coverImageUrl: resolveAssetUrl(uploadedBanner ?? `/assets/user-banners/banner-${bannerIndex}.jpg`),
    }

    void onSubmitProfile(profilePayload)
  }

  const canClose = stage === 'COMPLETED'

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

          {stage === 'COMPLETED' ? (
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
          ) : stage === 'ONCHAIN' ? (
            <div className="p-12 flex flex-col items-center gap-4 text-center">
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-8 h-8 text-[#1c9cf0] animate-spin" />
                  <p className="text-lg font-semibold">Finalising on-chain registration...</p>
                  <p className="text-sm text-muted-foreground">
                    This may take a few moments. You can keep this window open or continue browsing.
                  </p>
                </>
              ) : error ? (
                <>
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <p className="text-sm text-red-500">{error}</p>
                  <button
                    type="button"
                    className="px-4 py-2 bg-[#1c9cf0] text-white rounded-lg disabled:opacity-50"
                    onClick={onRetryOnchain}
                    disabled={isSubmitting}
                  >
                    Retry on-chain step
                  </button>
                </>
              ) : (
                <>
                  <Sparkles className="w-8 h-8 text-[#1c9cf0]" />
                  <p className="text-lg font-semibold">Finalise your on-chain identity</p>
                  <p className="text-sm text-muted-foreground">
                    We’ll register your wallet on Base Sepolia. Keep MetaMask (or your selected wallet) handy
                    to approve the transaction.
                  </p>
                  <button
                    type="button"
                    className="px-4 py-2 bg-[#1c9cf0] text-white rounded-lg disabled:opacity-50"
                    onClick={onRetryOnchain}
                    disabled={isSubmitting}
                  >
                    Start on-chain registration
                  </button>
                </>
              )}
            </div>
          ) : isLoadingDefaults ? (
            <div className="p-12 flex flex-col items-center gap-4">
              <RefreshCw className="w-8 h-8 text-[#1c9cf0] animate-spin" />
              <p className="text-muted-foreground">Generating your profile...</p>
            </div>
          ) : (
            renderProfileForm()
          )}
        </div>
      </div>
    </>
  )
}
