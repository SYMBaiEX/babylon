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
      <div className="max-w-2xl mx-auto py-8">
        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Complete Your Profile</h1>
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
                s <= step ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Choose a Username</h2>
                  <p className="text-sm text-muted-foreground">This will be your unique identifier</p>
                </div>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-2">
                💡 Lowercase letters, numbers, and underscores only
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Set Display Name</h2>
                  <p className="text-sm text-muted-foreground">How others will see you</p>
                </div>
              </div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display Name"
                maxLength={50}
                className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Image className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Profile Image</h2>
                  <p className="text-sm text-muted-foreground">Add an image URL (optional)</p>
                </div>
              </div>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-2">
                💡 We'll use your wallet avatar if you skip this
              </p>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Bio</h2>
                  <p className="text-sm text-muted-foreground">Tell us about yourself</p>
                </div>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Your bio..."
                rows={4}
                maxLength={280}
                className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                💡 Share your trading strategy or favorite NPCs
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 py-3 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-all"
          >
            Skip for Now
          </button>
          
          {step < totalSteps ? (
            <button
              onClick={handleNext}
              className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium disabled:opacity-50 flex items-center justify-center gap-2"
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

