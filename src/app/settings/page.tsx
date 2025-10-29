'use client'

import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, User, Bell, Lock, Palette, Save, AlertCircle, Check, Wallet as WalletIcon, Copy, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { LoginButton } from '@/components/auth/LoginButton'
import { PageContainer } from '@/components/shared/PageContainer'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Separator } from '@/components/shared/Separator'
import { cn } from '@/lib/utils'

interface ProfileFormData {
  username: string
  displayName: string
  bio: string
  profileImageUrl: string
}

interface NotificationSettings {
  pushNotifications: boolean
  emailUpdates: boolean
  marketAlerts: boolean
  tradingUpdates: boolean
}

export default function SettingsPage() {
  const { ready, authenticated, logout } = useAuth()
  const { user, wallet, setUser } = useAuthStore()
  
  // Profile form state
  const [formData, setFormData] = useState<ProfileFormData>({
    username: '',
    displayName: '',
    bio: '',
    profileImageUrl: '',
  })
  
  // Notification settings state
  const [notifications, setNotifications] = useState<NotificationSettings>({
    pushNotifications: true,
    emailUpdates: false,
    marketAlerts: true,
    tradingUpdates: true,
  })
  
  // UI state
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copiedWallet, setCopiedWallet] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load user data
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        displayName: user.displayName || '',
        bio: user.bio || '',
        profileImageUrl: user.profileImageUrl || '',
      })
    }
  }, [user])

  // Track changes
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

  const handleNotificationToggle = (field: keyof NotificationSettings) => {
    setNotifications(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const handleSaveProfile = async () => {
    if (!user?.id || !hasChanges) return

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const response = await fetch(`/api/users/${user.id}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      // Update local state
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

  const handleCopyWallet = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address)
      setCopiedWallet(true)
      setTimeout(() => setCopiedWallet(false), 2000)
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .neumorphic-settings-card {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
          }

          .neumorphic-settings-button {
            box-shadow: inset 3px 3px 3px rgba(0, 0, 0, 0.1), inset -3px -3px 3px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-settings-button:hover:not(:disabled) {
            box-shadow: none;
          }

          .neumorphic-input {
            box-shadow: inset 3px 3px 5px rgba(0, 0, 0, 0.15), inset -3px -3px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-input:focus {
            box-shadow: inset 3px 3px 5px rgba(28, 156, 240, 0.2), inset -3px -3px 5px rgba(28, 156, 240, 0.1);
          }

          .neumorphic-toggle {
            box-shadow: inset 3px 3px 5px rgba(0, 0, 0, 0.15), inset -3px -3px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-toggle-active {
            box-shadow: inset 3px 3px 5px rgba(28, 156, 240, 0.3), inset -3px -3px 5px rgba(28, 156, 240, 0.1);
          }
        `
      }} />
      <PageContainer noPadding className="flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SettingsIcon className="w-6 h-6" style={{ color: '#64748b' }} />
                <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              </div>
              {hasChanges && authenticated && (
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold',
                    'bg-sidebar-accent/30 neumorphic-settings-button',
                    'transition-all duration-300',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  style={{ color: '#1c9cf0' }}
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
          {/* Authentication Notice */}
          {ready && !authenticated && (
            <>
              <div className="bg-sidebar-accent/30 p-4">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm mb-1 text-foreground">Connect Your Wallet</h3>
                      <p className="text-xs text-muted-foreground">
                        Access your settings and preferences
                      </p>
                    </div>
                    <LoginButton />
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          <div className="max-w-2xl mx-auto p-4 space-y-6">
            {/* Save Feedback */}
            {saveSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-sidebar-accent/30 border-2" style={{ borderColor: '#10b981' }}>
                <Check className="w-5 h-5" style={{ color: '#10b981' }} />
                <span className="text-sm font-medium" style={{ color: '#10b981' }}>Profile updated successfully!</span>
              </div>
            )}

            {saveError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-sidebar-accent/30 border-2" style={{ borderColor: '#b82323' }}>
                <AlertCircle className="w-5 h-5" style={{ color: '#b82323' }} />
                <span className="text-sm font-medium" style={{ color: '#b82323' }}>{saveError}</span>
              </div>
            )}

            {/* Account Settings */}
            <div className={cn(
              'bg-sidebar-accent/30 rounded-xl p-4',
              'neumorphic-settings-card',
              'transition-all duration-300'
            )}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center neumorphic-settings-button"
                  style={{ backgroundColor: '#8b5cf620' }}
                >
                  <User className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Account</h2>
              </div>

              <div className="space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    placeholder="your_username"
                    disabled={!authenticated}
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm',
                      'bg-sidebar-accent/50 neumorphic-input',
                      'text-foreground placeholder:text-muted-foreground',
                      'focus:outline-none transition-all duration-300',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    3-20 characters, lowercase letters, numbers, and underscores only
                  </p>
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder="Your Display Name"
                    disabled={!authenticated}
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm',
                      'bg-sidebar-accent/50 neumorphic-input',
                      'text-foreground placeholder:text-muted-foreground',
                      'focus:outline-none transition-all duration-300',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm',
                      'bg-sidebar-accent/30 neumorphic-input',
                      'text-muted-foreground',
                      'cursor-not-allowed opacity-70'
                    )}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Email is managed through your connected wallet
                  </p>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Bio
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    disabled={!authenticated}
                    rows={3}
                    maxLength={160}
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm resize-none',
                      'bg-sidebar-accent/50 neumorphic-input',
                      'text-foreground placeholder:text-muted-foreground',
                      'focus:outline-none transition-all duration-300',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.bio.length}/160 characters
                  </p>
                </div>

                {/* Profile Image URL */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Profile Image URL
                  </label>
                  <input
                    type="url"
                    value={formData.profileImageUrl}
                    onChange={(e) => handleInputChange('profileImageUrl', e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    disabled={!authenticated}
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm',
                      'bg-sidebar-accent/50 neumorphic-input',
                      'text-foreground placeholder:text-muted-foreground',
                      'focus:outline-none transition-all duration-300',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className={cn(
              'bg-sidebar-accent/30 rounded-xl p-4',
              'neumorphic-settings-card',
              'transition-all duration-300'
            )}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center neumorphic-settings-button"
                  style={{ backgroundColor: '#10b98120' }}
                >
                  <Palette className="w-5 h-5" style={{ color: '#10b981' }} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Theme
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Switch between light and dark mode
                    </p>
                  </div>
                  <ThemeToggle />
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className={cn(
              'bg-sidebar-accent/30 rounded-xl p-4',
              'neumorphic-settings-card',
              'transition-all duration-300'
            )}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center neumorphic-settings-button"
                  style={{ backgroundColor: '#f59e0b20' }}
                >
                  <Bell className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
              </div>

              <div className="space-y-4">
                {Object.entries({
                  pushNotifications: 'Push Notifications',
                  emailUpdates: 'Email Updates',
                  marketAlerts: 'Market Alerts',
                  tradingUpdates: 'Trading Updates',
                }).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-medium text-foreground">
                        {label}
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {key === 'pushNotifications' && 'Receive push notifications in browser'}
                        {key === 'emailUpdates' && 'Get updates via email'}
                        {key === 'marketAlerts' && 'Alert me on significant market movements'}
                        {key === 'tradingUpdates' && 'Notify me about my positions and trades'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleNotificationToggle(key as keyof NotificationSettings)}
                      disabled={!authenticated}
                      className={cn(
                        'relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300',
                        'neumorphic-toggle',
                        notifications[key as keyof NotificationSettings] && 'neumorphic-toggle-active',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                      style={{
                        backgroundColor: notifications[key as keyof NotificationSettings] 
                          ? '#1c9cf0' 
                          : 'rgba(var(--sidebar-accent), 0.5)'
                      }}
                    >
                      <span
                        className={cn(
                          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300',
                          'shadow-md',
                          notifications[key as keyof NotificationSettings] ? 'translate-x-8' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy & Security */}
            {authenticated && (
              <div className={cn(
                'bg-sidebar-accent/30 rounded-xl p-4',
                'neumorphic-settings-card',
                'transition-all duration-300'
              )}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center neumorphic-settings-button"
                    style={{ backgroundColor: '#b8232320' }}
                  >
                    <Lock className="w-5 h-5" style={{ color: '#b82323' }} />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Privacy & Security</h2>
                </div>

                <div className="space-y-4">
                  {/* Connected Wallet */}
                  {wallet?.address && (
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                        Connected Wallet
                      </label>
                      <button
                        onClick={handleCopyWallet}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg',
                          'bg-sidebar-accent/50 neumorphic-settings-button',
                          'transition-all duration-300'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <WalletIcon className="w-5 h-5" style={{ color: '#1c9cf0' }} />
                          <span className="font-mono text-sm text-foreground">
                            {formatAddress(wallet.address)}
                          </span>
                        </div>
                        {copiedWallet ? (
                          <Check className="w-4 h-4" style={{ color: '#10b981' }} />
                        ) : (
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Logout */}
                  <div>
                    <button
                      onClick={logout}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
                        'bg-sidebar-accent/50 neumorphic-settings-button',
                        'transition-all duration-300'
                      )}
                      style={{ color: '#b82323' }}
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="text-sm font-semibold">Disconnect Wallet</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            {authenticated && (
              <div className={cn(
                'rounded-xl p-4 border-2',
                'bg-sidebar-accent/20',
                'transition-all duration-300'
              )}
              style={{ borderColor: '#b8232340' }}
              >
                <h2 className="text-lg font-semibold mb-4" style={{ color: '#b82323' }}>
                  Danger Zone
                </h2>
                <div className="space-y-3">
                  <button
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm font-semibold',
                      'bg-sidebar-accent/30 neumorphic-settings-button',
                      'transition-all duration-300'
                    )}
                    style={{ color: '#b82323' }}
                    onClick={() => {
                      if (confirm('Are you sure you want to deactivate your account? You can reactivate it later.')) {
                        // Handle deactivation
                        console.log('Deactivate account')
                      }
                    }}
                  >
                    Deactivate Account
                  </button>
                  <button
                    className={cn(
                      'w-full px-4 py-3 rounded-lg text-sm font-semibold',
                      'border-2 transition-all duration-300',
                      'hover:bg-destructive hover:text-white'
                    )}
                    style={{ 
                      borderColor: '#b82323',
                      color: '#b82323'
                    }}
                    onClick={() => {
                      if (confirm('⚠️ WARNING: This action cannot be undone!\n\nAre you absolutely sure you want to permanently delete your account?')) {
                        // Handle deletion
                        console.log('Delete account')
                      }
                    }}
                  >
                    Delete Account Permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </>
  )
}
