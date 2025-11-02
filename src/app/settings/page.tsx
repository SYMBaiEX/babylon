'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Bell, Palette, Shield, Save } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { LoginButton } from '@/components/auth/LoginButton'

export default function SettingsPage() {
  const router = useRouter()
  const { ready, authenticated } = useAuth()
  const { user, setUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Profile settings state
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [username, setUsername] = useState(user?.username || '')
  const [bio, setBio] = useState('')

  // Notification settings state
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)
  const [postNotifications, setPostNotifications] = useState(true)
  const [marketNotifications, setMarketNotifications] = useState(true)

  // Theme settings state
  const [theme, setTheme] = useState('dark')

  // Calculate time remaining until username can be changed again
  const getUsernameChangeTimeRemaining = (): { canChange: boolean; hours: number; minutes: number } | null => {
    if (!user?.usernameChangedAt) return { canChange: true, hours: 0, minutes: 0 }
    
    const lastChangeTime = new Date(user.usernameChangedAt).getTime()
    const now = Date.now()
    const hoursSinceChange = (now - lastChangeTime) / (1000 * 60 * 60)
    const hoursRemaining = 24 - hoursSinceChange

    if (hoursRemaining <= 0) {
      return { canChange: true, hours: 0, minutes: 0 }
    }

    return {
      canChange: false,
      hours: Math.floor(hoursRemaining),
      minutes: Math.floor((hoursRemaining - Math.floor(hoursRemaining)) * 60),
    }
  }

  const usernameChangeLimit = getUsernameChangeTimeRemaining()

  // Sync username when user changes
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username)
    }
  }, [user?.username])

  const handleSave = async () => {
    if (!user?.id) return
    
    setSaving(true)
    setSaved(false)
    
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
        body: JSON.stringify({
          displayName,
          username,
          bio,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      const data = await response.json()
      
      // Update user in store
      if (data.user && user) {
        setUser({
          ...user,
          username: data.user.username,
          displayName: data.user.displayName,
          bio: data.user.bio,
          usernameChangedAt: data.user.usernameChangedAt,
          referralCode: data.user.referralCode, // Update referral code if username changed
        })
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      // Error handling - could show toast here
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!ready) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageContainer>
    )
  }

  if (!authenticated) {
    return (
      <PageContainer>
        <div className="max-w-2xl mx-auto text-center py-12">
          <h1 className="text-3xl font-bold mb-4">Settings</h1>
          <p className="text-muted-foreground mb-8">
            Please sign in to access your settings.
          </p>
          <LoginButton />
        </div>
      </PageContainer>
    )
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'security', label: 'Security', icon: Shield },
  ]

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 border-b-2 transition-all',
                  activeTab === tab.id
                    ? 'border-[#1c9cf0] text-[#1c9cf0]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium mb-2">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]"
                  placeholder="Enter your display name"
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={usernameChangeLimit && !usernameChangeLimit.canChange}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0] disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter your username"
                />
                {usernameChangeLimit && !usernameChangeLimit.canChange ? (
                  <p className="text-xs text-yellow-500 mt-1">
                    Username can only be changed once every 24 hours. Please wait {usernameChangeLimit.hours}h {usernameChangeLimit.minutes}m before changing again.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Username can be changed once every 24 hours. Changing your username will update your referral code.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="bio" className="block text-sm font-medium mb-2">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c9cf0] resize-none"
                  placeholder="Tell us about yourself..."
                />
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Email Notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1c9cf0] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c9cf0]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Push Notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    Receive push notifications in your browser
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushNotifications}
                    onChange={(e) => setPushNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1c9cf0] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c9cf0]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">New Posts</h3>
                  <p className="text-sm text-muted-foreground">
                    Get notified when people you follow post
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={postNotifications}
                    onChange={(e) => setPostNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1c9cf0] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c9cf0]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Market Updates</h3>
                  <p className="text-sm text-muted-foreground">
                    Get notified about market changes
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marketNotifications}
                    onChange={(e) => setMarketNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1c9cf0] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c9cf0]"></div>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'theme' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-4">Theme Preference</h3>
                <div className="space-y-2">
                  {['light', 'dark', 'system'].map((themeOption) => (
                    <label
                      key={themeOption}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={themeOption}
                        checked={theme === themeOption}
                        onChange={(e) => setTheme(e.target.value)}
                        className="w-4 h-4 text-[#1c9cf0]"
                      />
                      <div>
                        <p className="font-medium capitalize">{themeOption}</p>
                        <p className="text-sm text-muted-foreground">
                          {themeOption === 'light' && 'Light background with dark text'}
                          {themeOption === 'dark' && 'Dark background with light text'}
                          {themeOption === 'system' && 'Match your system settings'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-medium mb-2">Account Security</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Your account is secured with Privy authentication.
                </p>
                <button className="text-[#1c9cf0] hover:text-[#1a8cd8] text-sm font-medium">
                  View Security Details →
                </button>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-medium mb-2">Connected Wallets</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Manage your connected blockchain wallets.
                </p>
                <button className="text-[#1c9cf0] hover:text-[#1a8cd8] text-sm font-medium">
                  Manage Wallets →
                </button>
              </div>

              <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-lg">
                <h3 className="font-medium text-red-500 mb-2">Danger Zone</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Delete your account and all associated data. This action cannot be undone.
                </p>
                <button className="text-red-500 hover:text-red-600 text-sm font-medium">
                  Delete Account →
                </button>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="pt-6 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all',
                'bg-[#1c9cf0] text-white hover:bg-[#1a8cd8]',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}