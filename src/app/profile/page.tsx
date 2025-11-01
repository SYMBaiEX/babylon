'use client'

import { useState, useEffect } from 'react'
import { User, Save, AlertCircle, Check, Calendar } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { LoginButton } from '@/components/auth/LoginButton'
import { PageContainer } from '@/components/shared/PageContainer'
import { Separator } from '@/components/shared/Separator'
import { cn } from '@/lib/utils'

interface ProfileFormData {
  username: string
  displayName: string
  bio: string
  profileImageUrl: string
}

export default function ProfilePage() {
  const { ready, authenticated } = useAuth()
  const { user, setUser } = useAuthStore()
  
  const [formData, setFormData] = useState<ProfileFormData>({
    username: '',
    displayName: '',
    bio: '',
    profileImageUrl: '',
  })
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        displayName: user.displayName || '',
        bio: user.bio || '',
        profileImageUrl: user.profileImageUrl || '',
      })
      setLoading(false)
    } else if (ready) {
      setLoading(false)
    }
  }, [user, ready])

  useEffect(() => {
    if (user) {
      const changed = 
        formData.username !== (user.username || '') ||
        formData.displayName !== (user.displayName || '') ||
        formData.bio !== (user.bio || '') ||
        formData.profileImageUrl !== (user.profileImageUrl || '')
      setHasChanges(changed)
    }
  }, [formData, user])

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setSaveError(null)
    setSaveSuccess(false)
  }

  const handleSaveProfile = async () => {
    if (!user?.id || !hasChanges) return

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
        body: JSON.stringify(formData),
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

      setUser({
        ...user,
        username: data.user.username,
        displayName: data.user.displayName,
        bio: data.user.bio,
        profileImageUrl: data.user.profileImageUrl,
        profileComplete: data.user.profileComplete,
      })

      setSaveSuccess(true)
      setHasChanges(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Profile</h1>
            </div>
            {hasChanges && authenticated && (
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
        <Separator />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {ready && !authenticated && (
          <>
            <div className="bg-muted/50 p-4">
              <div className="max-w-2xl mx-auto">
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
            <Separator />
          </>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : authenticated && user ? (
          <div className="max-w-2xl mx-auto p-4 space-y-6">
            {/* Save Feedback */}
            {saveSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Profile updated successfully!</span>
              </div>
            )}
            {saveError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">{saveError}</span>
              </div>
            )}

            {/* Profile Info Card */}
            <div className="rounded-xl bg-sidebar-accent/30 p-4">
              <div className="flex items-start gap-4">
                {formData.profileImageUrl ? (
                  <img
                    src={formData.profileImageUrl}
                    alt={formData.displayName || 'Profile'}
                    className="w-20 h-20 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-10 h-10 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold truncate text-foreground">
                    {formData.displayName || 'Your Profile'}
                  </h2>
                  <p className="text-sm text-muted-foreground truncate">
                    {`@${formData.username}` || '@username'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Joined {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Settings Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="your_username"
                  className="w-full px-4 py-3 rounded-lg text-sm bg-sidebar-accent/50 text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  3-20 characters, lowercase letters, numbers, and underscores only
                </p>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  placeholder="Your Display Name"
                  className="w-full px-4 py-3 rounded-lg text-sm bg-sidebar-accent/50 text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={user.email || ''}
                  disabled
                  className="w-full px-4 py-3 rounded-lg text-sm bg-sidebar-accent/30 text-muted-foreground cursor-not-allowed opacity-70"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Email is managed through your connected wallet
                </p>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Bio
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={3}
                  maxLength={160}
                  className="w-full px-4 py-3 rounded-lg text-sm resize-none bg-sidebar-accent/50 text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.bio.length}/160 characters
                </p>
              </div>
              
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Profile Image URL
                </label>
                <input
                  type="url"
                  value={formData.profileImageUrl}
                  onChange={(e) => handleInputChange('profileImageUrl', e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full px-4 py-3 rounded-lg text-sm bg-sidebar-accent/50 text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            </div>

            <Separator />

            {/* Stats */}
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-bold text-foreground">0</span>
                <span className="text-muted-foreground ml-1">Following</span>
              </div>
              <div>
                <span className="font-bold text-foreground">0</span>
                <span className="text-muted-foreground ml-1">Followers</span>
              </div>
              <div>
                <span className="font-bold text-foreground">0</span>
                <span className="text-muted-foreground ml-1">Posts</span>
              </div>
            </div>

            <Separator />

            {/* Posts section */}
            <div className="text-center text-muted-foreground py-12">
              <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Your posts will appear here</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-4">
            <div className="text-center text-muted-foreground py-12">
              <p>Please connect your wallet to view your profile.</p>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
