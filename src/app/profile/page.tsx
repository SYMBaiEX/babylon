'use client'

import { LoginButton } from '@/components/auth/LoginButton'
import { PageContainer } from '@/components/shared/PageContainer'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { LinkSocialAccountsModal } from '@/components/profile/LinkSocialAccountsModal'
import { 
  AlertCircle, 
  Calendar, 
  Check, 
  User, 
  Trophy, 
  Camera, 
  Edit2,
  X as XIcon,
  ExternalLink,
  Eye,
  EyeOff,
  Wallet,
  Link as LinkIcon
} from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ProfileFormData {
  username: string
  displayName: string
  bio: string
  profileImageUrl: string
  coverImageUrl: string
}

interface EditingField {
  field: keyof ProfileFormData | null
  tempValue: string
}

interface SocialVisibility {
  twitter: boolean
  farcaster: boolean
  wallet: boolean
}

interface ImageUploadState {
  isOpen: boolean
  type: 'profileImageUrl' | 'coverImageUrl' | null
  preview: string | null
  file: File | null
  isUploading: boolean
  error: string | null
}

export default function ProfilePage() {
  const { ready, authenticated } = useAuth()
  const { user, setUser } = useAuthStore()
  
  const [formData, setFormData] = useState<ProfileFormData>({
    username: '',
    displayName: '',
    bio: '',
    profileImageUrl: '',
    coverImageUrl: '',
  })
  
  const [editing, setEditing] = useState<EditingField>({ field: null, tempValue: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'posts' | 'replies'>('posts')
  const [showLinkAccountsModal, setShowLinkAccountsModal] = useState(false)
  
  // Social visibility toggles
  const [socialVisibility, setSocialVisibility] = useState<SocialVisibility>({
    twitter: true,
    farcaster: true,
    wallet: true,
  })
  
  // Image upload state
  const [imageUpload, setImageUpload] = useState<ImageUploadState>({
    isOpen: false,
    type: null,
    preview: null,
    file: null,
    isUploading: false,
    error: null,
  })
  
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        displayName: user.displayName || '',
        bio: user.bio || '',
        profileImageUrl: user.profileImageUrl || '',
        coverImageUrl: user.coverImageUrl || '',
      })
      
      // Load visibility preferences from user
      setSocialVisibility({
        twitter: user.showTwitterPublic ?? true,
        farcaster: user.showFarcasterPublic ?? true,
        wallet: user.showWalletPublic ?? true,
      })
      
      setLoading(false)
    } else if (ready) {
      setLoading(false)
    }
  }, [user, ready])

  // Auto-focus when editing starts
  useEffect(() => {
    if (editing.field && editInputRef.current) {
      editInputRef.current.focus()
      if (editInputRef.current instanceof HTMLInputElement || editInputRef.current instanceof HTMLTextAreaElement) {
        editInputRef.current.select()
      }
    }
  }, [editing.field])

  const startEditing = (field: keyof ProfileFormData) => {
    setEditing({ field, tempValue: formData[field] })
    setSaveError(null)
    setSaveSuccess(false)
  }

  const cancelEditing = () => {
    setEditing({ field: null, tempValue: '' })
  }

  const saveField = async () => {
    if (!editing.field || !user?.id) return

    const updatedData = {
      ...formData,
      [editing.field]: editing.tempValue,
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`/api/users/${user.id}/update-profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify(updatedData),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to update profile'
        try {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json()
            errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`
          }
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()

      setFormData({
        username: data.user.username,
        displayName: data.user.displayName,
        bio: data.user.bio,
        profileImageUrl: data.user.profileImageUrl,
        coverImageUrl: data.user.coverImageUrl || '',
      })

      setUser({
        ...user,
        username: data.user.username,
        displayName: data.user.displayName,
        bio: data.user.bio,
        profileImageUrl: data.user.profileImageUrl,
        coverImageUrl: data.user.coverImageUrl,
        profileComplete: data.user.profileComplete,
      })

      // Update user in store with all new data including reputation points
      if (data.user.reputationPoints !== undefined) {
        setUser({
          ...user,
          reputationPoints: data.user.reputationPoints,
          referralCount: data.user.referralCount,
        })
      }

      setSaveSuccess(true)
      setEditing({ field: null, tempValue: '' })
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && editing.field !== 'bio') {
      e.preventDefault()
      saveField()
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  const toggleSocialVisibility = async (platform: keyof SocialVisibility) => {
    if (!user?.id) return
    
    const newValue = !socialVisibility[platform]
    
    // Optimistic update
    setSocialVisibility(prev => ({
      ...prev,
      [platform]: newValue
    }))
    
    try {
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`/api/users/${user.id}/update-visibility`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          platform,
          visible: newValue,
        }),
      })

      if (!response.ok) {
        // Revert on error
        setSocialVisibility(prev => ({
          ...prev,
          [platform]: !newValue
        }))
        throw new Error('Failed to update visibility')
      }

      const data = await response.json()
      
      // Update user in store
      if (data.visibility) {
        setUser({
          ...user,
          showTwitterPublic: data.visibility.twitter,
          showFarcasterPublic: data.visibility.farcaster,
          showWalletPublic: data.visibility.wallet,
        })
      }
    } catch (error) {
      console.error('Error updating visibility:', error)
      setSaveError('Failed to update visibility preference')
      setTimeout(() => setSaveError(null), 3000)
    }
  }

  const openImageUpload = (type: 'profileImageUrl' | 'coverImageUrl') => {
    setImageUpload({
      isOpen: true,
      type,
      preview: null,
      file: null,
      isUploading: false,
      error: null,
    })
  }

  const closeImageUpload = () => {
    setImageUpload({
      isOpen: false,
      type: null,
      preview: null,
      file: null,
      isUploading: false,
      error: null,
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setImageUpload(prev => ({
        ...prev,
        error: 'Please select a valid image file (JPEG, PNG, WebP, or GIF)',
      }))
      return
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setImageUpload(prev => ({
        ...prev,
        error: 'File size must be less than 10MB',
      }))
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImageUpload(prev => ({
        ...prev,
        file,
        preview: reader.result as string,
        error: null,
      }))
    }
    reader.readAsDataURL(file)
  }

  const confirmImageUpload = async () => {
    if (!imageUpload.file || !imageUpload.type || !user?.id) return

    setImageUpload(prev => ({ ...prev, isUploading: true, error: null }))

    try {
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      
      // Upload image
      const formData = new FormData()
      formData.append('file', imageUpload.file)
      formData.append('type', imageUpload.type === 'profileImageUrl' ? 'profile' : 'cover')

      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const uploadResponse = await fetch('/api/upload/image', {
        method: 'POST',
        headers,
        body: formData,
      })

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json()
        throw new Error(data.error || 'Failed to upload image')
      }

      const uploadData = await uploadResponse.json()

      // Update profile with new image URL
      const updateResponse = await fetch(`/api/users/${user.id}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...formData,
          [imageUpload.type]: uploadData.url,
        }),
      })

      if (!updateResponse.ok) {
        const data = await updateResponse.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      const profileData = await updateResponse.json()

      // Update local state
      const imageType = imageUpload.type as 'profileImageUrl' | 'coverImageUrl'
      setFormData(prev => ({
        ...prev,
        [imageType]: uploadData.url,
      }))

      setUser({
        ...user,
        profileImageUrl: profileData.user.profileImageUrl,
        coverImageUrl: profileData.user.coverImageUrl,
      })

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)

      // Close modal
      closeImageUpload()
    } catch (error) {
      setImageUpload(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to upload image',
        isUploading: false,
      }))
    }
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {ready && !authenticated && (
          <div className="bg-muted/50 border-b border-border p-4">
            <div className="max-w-[600px] mx-auto">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1 text-foreground">Connect Your Wallet</h3>
                  <p className="text-xs text-muted-foreground">
                    View and edit your profile
                  </p>
                </div>
                <LoginButton />
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : authenticated && user ? (
          <>
            {/* Profile Header - Twitter Style */}
            <div className="border-b border-border">
              <div className="max-w-[600px] mx-auto">
                {/* Cover Image */}
                <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5 group">
                  {formData.coverImageUrl ? (
                    <img
                      src={formData.coverImageUrl}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                  <button
                    onClick={() => openImageUpload('coverImageUrl')}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <div className="flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full text-white">
                      <Camera className="w-4 h-4" />
                      <span className="text-sm font-medium">Change cover</span>
                    </div>
                  </button>
                </div>

                {/* Profile Info */}
                <div className="px-4 pb-4">
                  {/* Profile Picture & Edit Button Row */}
                  <div className="flex items-start justify-between -mt-16 mb-4">
                    <div className="relative group">
                      {formData.profileImageUrl ? (
                        <img
                          src={formData.profileImageUrl}
                          alt={formData.displayName || 'Profile'}
                          className="w-32 h-32 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="w-16 h-16 text-primary" />
                        </div>
                      )}
                      <button
                        onClick={() => openImageUpload('profileImageUrl')}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Camera className="w-6 h-6 text-white" />
                      </button>
                    </div>
                    
                    {/* Edit Profile Button - Twitter Style */}
                    <button 
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="mt-3 px-4 py-1.5 rounded-full border border-border hover:bg-muted/50 transition-colors font-semibold text-sm"
                    >
                      Edit profile
                    </button>
                  </div>

                  {/* Save Feedback */}
                  {saveSuccess && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 mb-4">
                      <Check className="w-5 h-5" />
                      <span className="text-sm font-medium">Profile updated successfully!</span>
                    </div>
                  )}
                  {saveError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 mb-4">
                      <AlertCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">{saveError}</span>
                    </div>
                  )}

                  {/* Display Name with Points - Editable */}
                  <div className="mb-0.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {editing.field === 'displayName' ? (
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            ref={editInputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={editing.tempValue}
                            onChange={(e) => setEditing({ ...editing, tempValue: e.target.value })}
                            onKeyDown={handleKeyDown}
                            placeholder="Display Name"
                            className="flex-1 text-xl font-bold bg-sidebar-accent/50 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={isSaving}
                          />
                          <button
                            onClick={saveField}
                            disabled={isSaving}
                            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={isSaving}
                            className="p-2 rounded-lg bg-muted hover:bg-muted/70 disabled:opacity-50"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing('displayName')}
                          className="group inline-flex items-center gap-2 hover:bg-muted/30 rounded px-2 py-0.5 -ml-2 transition-colors"
                        >
                          <h2 className="text-xl font-bold text-foreground">
                            {formData.displayName || 'Add display name'}
                          </h2>
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </div>
                    
                    {/* Points Display */}
                    {user.reputationPoints !== undefined && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 flex-shrink-0">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        <span className="font-bold text-foreground">{user.reputationPoints.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">pts</span>
                      </div>
                    )}
                  </div>

                  {/* Username - Editable */}
                  <div className="mb-3">
                    {editing.field === 'username' ? (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-muted-foreground text-sm">@</span>
                        <input
                          ref={editInputRef as React.RefObject<HTMLInputElement>}
                          type="text"
                          value={editing.tempValue}
                          onChange={(e) => setEditing({ ...editing, tempValue: e.target.value })}
                          onKeyDown={handleKeyDown}
                          placeholder="username"
                          className="flex-1 text-sm bg-sidebar-accent/50 rounded-lg px-3 py-2 text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          disabled={isSaving}
                        />
                        <button
                          onClick={saveField}
                          disabled={isSaving}
                          className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={isSaving}
                          className="p-2 rounded-lg bg-muted hover:bg-muted/70 disabled:opacity-50"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditing('username')}
                        className="group inline-flex items-center gap-1.5 hover:bg-muted/30 rounded px-2 py-0.5 -ml-2 transition-colors"
                      >
                        <p className="text-sm text-muted-foreground">
                          @{formData.username || 'add_username'}
                        </p>
                        <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>

                  {/* Bio - Editable */}
                  <div className="mb-3">
                    {editing.field === 'bio' ? (
                      <div className="space-y-2">
                        <textarea
                          ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                          value={editing.tempValue}
                          onChange={(e) => setEditing({ ...editing, tempValue: e.target.value })}
                          onKeyDown={handleKeyDown}
                          placeholder="Tell us about yourself..."
                          rows={3}
                          maxLength={160}
                          className="w-full bg-sidebar-accent/50 rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                          disabled={isSaving}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {editing.tempValue.length}/160
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={saveField}
                              disabled={isSaving}
                              className="px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={isSaving}
                              className="px-3 py-1 rounded-lg bg-muted hover:bg-muted/70 disabled:opacity-50 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditing('bio')}
                        className="group w-full text-left hover:bg-muted/30 rounded px-2 py-1.5 -ml-2 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">
                            {formData.bio || 'Add a bio'}
                          </p>
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Social Links Section */}
                  <div className="mb-3 space-y-2">
                    {/* Twitter/X */}
                    {user.hasTwitter && user.twitterUsername && (
                      <div className="flex items-center justify-between group">
                        <a
                          href={`https://twitter.com/${user.twitterUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <span>@{user.twitterUsername}</span>
                          {socialVisibility.twitter && <ExternalLink className="w-3 h-3" />}
                        </a>
                        <button
                          onClick={() => toggleSocialVisibility('twitter')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                          title={socialVisibility.twitter ? 'Public' : 'Private'}
                        >
                          {socialVisibility.twitter ? (
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Farcaster */}
                    {user.hasFarcaster && user.farcasterUsername && (
                      <div className="flex items-center justify-between group">
                        <a
                          href={`https://warpcast.com/${user.farcasterUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 1000 1000" fill="currentColor">
                            <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z"/>
                            <path d="M128.889 253.333L157.778 351.111H182.222V844.444H128.889V253.333Z"/>
                            <path d="M871.111 253.333L842.222 351.111H817.778V844.444H871.111V253.333Z"/>
                          </svg>
                          <span>@{user.farcasterUsername}</span>
                          {socialVisibility.farcaster && <ExternalLink className="w-3 h-3" />}
                        </a>
                        <button
                          onClick={() => toggleSocialVisibility('farcaster')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                          title={socialVisibility.farcaster ? 'Public' : 'Private'}
                        >
                          {socialVisibility.farcaster ? (
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Wallet */}
                    {user.walletAddress && (
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Wallet className="w-4 h-4" />
                          <span className="font-mono text-xs">
                            {socialVisibility.wallet 
                              ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
                              : '••••••••••••'
                            }
                          </span>
                        </div>
                        <button
                          onClick={() => toggleSocialVisibility('wallet')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                          title={socialVisibility.wallet ? 'Public' : 'Private'}
                        >
                          {socialVisibility.wallet ? (
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Add connections prompt */}
                    {(!user.hasTwitter || !user.hasFarcaster) && (
                      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground w-full">
                        <div className="flex items-center gap-2">
                          <LinkIcon className="w-4 h-4" />
                          <span>Connect via wallet for social links</span>
                        </div>
                        <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-medium">
                          +1000 pts each
                        </span>
                      </div>
                    )}
                  </div>

                   {/* Metadata - Twitter Style */}
                   <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                     {user.createdAt && (
                       <div className="flex items-center gap-1.5">
                         <Calendar className="w-4 h-4" />
                         <span>Joined {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                       </div>
                     )}
                     {user.reputationPoints !== undefined && (
                       <div className="flex items-center gap-1.5">
                         <Trophy className="w-4 h-4 text-yellow-500" />
                         <span className="font-medium text-foreground">{user.reputationPoints.toLocaleString()} pts</span>
                       </div>
                     )}
                   </div>

                  {/* Stats - Twitter Style */}
                  <div className="flex gap-4 text-sm mb-4">
                    <button className="hover:underline">
                      <span className="font-bold text-foreground">{user.stats?.following || 0}</span>
                      <span className="text-muted-foreground ml-1">Following</span>
                    </button>
                    <button className="hover:underline">
                      <span className="font-bold text-foreground">{user.stats?.followers || 0}</span>
                      <span className="text-muted-foreground ml-1">Followers</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs: Posts vs Replies */}
            <div className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
              <div className="max-w-[600px] mx-auto">
                <div className="flex">
                  <button
                    onClick={() => setTab('posts')}
                    className={cn(
                      'flex-1 py-4 font-semibold transition-colors relative hover:bg-muted/30',
                      tab === 'posts' ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    Posts
                    {tab === 'posts' && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t" />
                    )}
                  </button>
                  <button
                    onClick={() => setTab('replies')}
                    className={cn(
                      'flex-1 py-4 font-semibold transition-colors relative hover:bg-muted/30',
                      tab === 'replies' ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    Replies
                    {tab === 'replies' && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Posts section */}
            <div className="max-w-[600px] mx-auto">
              <div className="text-center text-muted-foreground py-12">
                <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {tab === 'posts' ? 'Your posts will appear here' : 'Your replies will appear here'}
                </p>
              </div>
            </div>

            {/* Link Social Accounts Modal */}
            <LinkSocialAccountsModal
              isOpen={showLinkAccountsModal}
              onClose={() => setShowLinkAccountsModal(false)}
            />

            {/* Modal for Image Upload with Preview */}
            {imageUpload.isOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-background rounded-xl max-w-lg w-full p-6 border border-border">
                  <h3 className="text-xl font-bold mb-4">
                    {imageUpload.type === 'profileImageUrl' ? 'Upload Profile Picture' : 'Upload Cover Image'}
                  </h3>
                  
                  <div className="space-y-4">
                    {/* File Input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={imageUpload.isUploading}
                    />

                    {/* Preview or Upload Button */}
                    {!imageUpload.preview ? (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUpload.isUploading}
                        className="w-full h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-3 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                      >
                        <Camera className="w-12 h-12 text-muted-foreground" />
                        <div className="text-center">
                          <p className="font-medium">Click to select image</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            JPEG, PNG, WebP, or GIF (max 10MB)
                          </p>
                        </div>
                      </button>
                    ) : (
                      <div className="space-y-3">
                        {/* Image Preview */}
                        <div className="relative rounded-lg overflow-hidden border border-border">
                          <img
                            src={imageUpload.preview}
                            alt="Preview"
                            className={cn(
                              "w-full object-cover",
                              imageUpload.type === 'profileImageUrl' ? 'h-64' : 'h-48'
                            )}
                          />
                          {imageUpload.isUploading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="flex flex-col items-center gap-3">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
                                <p className="text-white text-sm font-medium">Uploading...</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Change Image Button */}
                        {!imageUpload.isUploading && (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm font-medium"
                          >
                            Choose Different Image
                          </button>
                        )}
                      </div>
                    )}

                    {/* Error Message */}
                    {imageUpload.error && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{imageUpload.error}</span>
                      </div>
                    )}

                    {/* Info Text */}
                    <p className="text-xs text-muted-foreground">
                      Your image will be automatically optimized and converted to WebP format for faster loading.
                    </p>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={confirmImageUpload}
                        disabled={!imageUpload.preview || imageUpload.isUploading}
                        className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {imageUpload.isUploading ? 'Uploading...' : 'Confirm & Upload'}
                      </button>
                      <button
                        onClick={closeImageUpload}
                        disabled={imageUpload.isUploading}
                        className="flex-1 px-4 py-2 rounded-lg bg-muted hover:bg-muted/70 disabled:opacity-50 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="max-w-[600px] mx-auto p-4">
            <div className="text-center text-muted-foreground py-12">
              <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Please connect your wallet to view your profile.</p>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
