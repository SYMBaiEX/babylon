'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, Image, FileText, CheckCircle } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

export default function ProfileSetupPage() {
  const { user, authenticated } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  // Load existing profile data if user is returning
  useEffect(() => {
    if (authenticated && user?.id) {
      fetch(`/api/users/${user.id}/profile`)
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setUsername(data.user.username || '')
            setDisplayName(data.user.displayName || '')
            setBio(data.user.bio || '')
            setImageUrl(data.user.profileImageUrl || '')
          }
          setInitialLoading(false)
        })
        .catch(err => {
          console.error('Error fetching profile:', err)
          setInitialLoading(false)
        })
    } else {
      setInitialLoading(false)
    }
  }, [authenticated, user?.id])

  const totalSteps = 4

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1)
    }
  }

  const handleSkip = () => {
    router.push('/feed')
  }

  const handleComplete = async () => {
    setLoading(true)

    try {
      const response = await fetch(`/api/users/${user?.id}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(window as any).__privyAccessToken}`,
        },
        body: JSON.stringify({
          username,
          displayName,
          bio,
          profileImageUrl: imageUrl,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to update profile')
        return
      }

      toast.success('Profile setup complete!')
      router.push('/feed')
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="max-w-2xl mx-auto py-8 px-4">
        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2 text-foreground">Complete Your Profile</h1>
              <p className="text-muted-foreground">
                Set up your profile to start engaging with NPCs and trading
              </p>
            </div>

            {/* Progress */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'h-2 flex-1 max-w-20 rounded-full transition-all',
                    s <= step 
                      ? 'bg-gradient-to-r from-primary to-primary/80 shadow-[0_0_10px_rgba(184,35,35,0.3)]' 
                      : 'bg-sidebar-accent/30'
                  )}
                />
              ))}
            </div>

            {/* Step Content */}
            <div 
              className="rounded-2xl p-8 mb-6 transition-all duration-300"
              style={{
                background: 'linear-gradient(145deg, #1a1a1a 0%, #0f0f0f 100%)',
                boxShadow: `
                  inset 8px 8px 16px rgba(0, 0, 0, 0.5),
                  inset -8px -8px 16px rgba(40, 40, 40, 0.1),
                  0 4px 20px rgba(0, 0, 0, 0.3)
                `,
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              {step === 1 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div 
                      className="p-3 rounded-xl"
                      style={{
                        background: 'rgba(184, 35, 35, 0.1)',
                        boxShadow: `
                          inset 2px 2px 4px rgba(0, 0, 0, 0.3),
                          inset -2px -2px 4px rgba(184, 35, 35, 0.1)
                        `
                      }}
                    >
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Choose a Username</h2>
                      <p className="text-sm text-muted-foreground">This will be your unique identifier</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username"
                    maxLength={20}
                    className="w-full px-4 py-3 rounded-xl bg-background text-foreground focus:outline-none transition-all"
                    style={{
                      boxShadow: `
                        inset 4px 4px 8px rgba(0, 0, 0, 0.5),
                        inset -4px -4px 8px rgba(40, 40, 40, 0.1)
                      `,
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                    <span className="text-amber-500">💡</span>
                    Lowercase letters, numbers, and underscores only
                  </p>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div 
                      className="p-3 rounded-xl"
                      style={{
                        background: 'rgba(184, 35, 35, 0.1)',
                        boxShadow: `
                          inset 2px 2px 4px rgba(0, 0, 0, 0.3),
                          inset -2px -2px 4px rgba(184, 35, 35, 0.1)
                        `
                      }}
                    >
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Set Display Name</h2>
                      <p className="text-sm text-muted-foreground">How others will see you</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display Name"
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-xl bg-background text-foreground focus:outline-none transition-all"
                    style={{
                      boxShadow: `
                        inset 4px 4px 8px rgba(0, 0, 0, 0.5),
                        inset -4px -4px 8px rgba(40, 40, 40, 0.1)
                      `,
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  />
                </div>
              )}

              {step === 3 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div 
                      className="p-3 rounded-xl"
                      style={{
                        background: 'rgba(184, 35, 35, 0.1)',
                        boxShadow: `
                          inset 2px 2px 4px rgba(0, 0, 0, 0.3),
                          inset -2px -2px 4px rgba(184, 35, 35, 0.1)
                        `
                      }}
                    >
                      <Image className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Profile Image</h2>
                      <p className="text-sm text-muted-foreground">Add an image URL (optional)</p>
                    </div>
                  </div>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full px-4 py-3 rounded-xl bg-background text-foreground focus:outline-none transition-all"
                    style={{
                      boxShadow: `
                        inset 4px 4px 8px rgba(0, 0, 0, 0.5),
                        inset -4px -4px 8px rgba(40, 40, 40, 0.1)
                      `,
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                    <span className="text-amber-500">💡</span>
                    We'll use your wallet avatar if you skip this
                  </p>
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div 
                      className="p-3 rounded-xl"
                      style={{
                        background: 'rgba(184, 35, 35, 0.1)',
                        boxShadow: `
                          inset 2px 2px 4px rgba(0, 0, 0, 0.3),
                          inset -2px -2px 4px rgba(184, 35, 35, 0.1)
                        `
                      }}
                    >
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Bio</h2>
                      <p className="text-sm text-muted-foreground">Tell us about yourself</p>
                    </div>
                  </div>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Your bio..."
                    rows={4}
                    maxLength={280}
                    className="w-full px-4 py-3 rounded-xl bg-background text-foreground focus:outline-none resize-none transition-all"
                    style={{
                      boxShadow: `
                        inset 4px 4px 8px rgba(0, 0, 0, 0.5),
                        inset -4px -4px 8px rgba(40, 40, 40, 0.1)
                      `,
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                    <span className="text-amber-500">💡</span>
                    Share your trading strategy or favorite NPCs
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleSkip}
                className="flex-1 py-3 px-6 rounded-xl text-muted-foreground hover:text-foreground transition-all font-medium"
                style={{
                  background: 'linear-gradient(145deg, #1a1a1a 0%, #0f0f0f 100%)',
                  boxShadow: `
                    4px 4px 8px rgba(0, 0, 0, 0.4),
                    -4px -4px 8px rgba(40, 40, 40, 0.1)
                  `,
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                Skip for Now
              </button>
              
              {step < totalSteps ? (
                <button
                  onClick={handleNext}
                  className="flex-1 py-3 px-6 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, #b82323 0%, #8b1c1c 100%)',
                    boxShadow: `
                      4px 4px 12px rgba(0, 0, 0, 0.4),
                      -4px -4px 12px rgba(184, 35, 35, 0.1),
                      0 0 20px rgba(184, 35, 35, 0.2)
                    `,
                    border: '1px solid rgba(184, 35, 35, 0.3)',
                    color: 'white'
                  }}
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex-1 py-3 px-6 rounded-xl font-medium transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: loading ? '#666' : 'linear-gradient(135deg, #b82323 0%, #8b1c1c 100%)',
                    boxShadow: loading ? 'none' : `
                      4px 4px 12px rgba(0, 0, 0, 0.4),
                      -4px -4px 12px rgba(184, 35, 35, 0.1),
                      0 0 20px rgba(184, 35, 35, 0.2)
                    `,
                    border: loading ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(184, 35, 35, 0.3)',
                    color: 'white'
                  }}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Complete Setup
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}

