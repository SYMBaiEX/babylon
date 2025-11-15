'use client'

import { PageContainer } from '@/components/shared/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { ArrowLeft, Bot, Brain, Coins, Dices, Loader2, Plus, Sparkles, TrendingUp, User, Wallet, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const STORAGE_KEY = 'babylon_agent_draft'

export default function CreateAgentPage() {
  const router = useRouter()
  const { user, authenticated, ready, getAccessToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [generatingField, setGeneratingField] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Form state with pre-filled defaults
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    profileImageUrl: '',
    system: '',
    bio: ['Strategic thinker', 'Data-driven analyst', 'Market expert'],
    personality: '',
    tradingStrategy: '',
    initialDeposit: 100,
    modelTier: 'free' as 'free' | 'pro'
  })

  // Load form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY)
    if (savedData) {
      const parsed = JSON.parse(savedData)
      setFormData(prev => ({ ...prev, ...parsed }))
    }
    setIsInitialized(true)
  }, [])

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    if (!isInitialized) return
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
  }, [formData, isInitialized])

  const updateField = (field: string, value: string | string[] | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleRandomName = () => {
    const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Sigma', 'Zeta']
    const suffixes = ['Trader', 'Bot', 'Agent', 'AI', 'Pro', 'Mind', 'Core']
    const name = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`
    updateField('name', name)
  }

  const handleGenerateField = async (field: string) => {
    setGeneratingField(field)
    
    try {
      const response = await fetch('/api/agents/generate-field', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fieldName: field,
          currentValue: formData[field as keyof typeof formData],
          context: {
            name: formData.name,
            description: formData.description,
            system: formData.system,
            personality: formData.personality,
            tradingStrategy: formData.tradingStrategy,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate field')
      }

      const result = await response.json()
      
      if (field === 'bio') {
        updateField('bio', result.value.split('|').map((s: string) => s.trim()))
      } else {
        updateField(field, result.value)
      }

      toast.success(`Generated ${field}!`)
    } catch (error) {
      console.error('Error generating field:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate field')
    } finally {
      setGeneratingField(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    if (!formData.name.trim()) {
      toast.error('Agent name is required')
      return
    }
    if (!formData.system.trim()) {
      toast.error('System prompt is required')
      return
    }

    setLoading(true)
    
    try {
      const token = await getAccessToken()
      
      if (!token) {
        toast.error('Authentication required')
        return
      }
      
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          bio: formData.bio.filter(b => b.trim())
        })
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        const errorMsg = error.error || 'Failed to create agent'
        toast.error(errorMsg)
        return
      }

      const data = await res.json() as { agent: { id: string } }
      
      // Clear draft
      localStorage.removeItem(STORAGE_KEY)
      
      toast.success('Agent created successfully!')
      router.push(`/agents/${data.agent.id}`)
    } catch (error) {
      console.error('Failed to create agent:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  if (!ready || !authenticated) {
    return (
      <PageContainer>
        <div className="p-4">
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-gradient-to-br from-[#0066FF]/10 to-purple-500/10 rounded-lg border border-[#0066FF]/20">
            <Bot className="w-16 h-16 mb-4 text-[#0066FF]" />
            <h3 className="text-2xl font-bold mb-2">Create an Agent</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Please sign in to create an AI agent
            </p>
          </div>
        </div>
      </PageContainer>
    )
  }

  const totalPoints = user?.reputationPoints || 0

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={() => router.push('/agents')}
            variant="ghost"
            className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Bot className="w-8 h-8 text-[#0066FF]" />
            <h1 className="text-3xl font-bold">Create New Agent</h1>
          </div>
          <p className="text-muted-foreground">
            Build your AI agent with powerful automation tools
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Card */}
          <div className="bg-card/50 backdrop-blur rounded-lg px-4 py-3 sm:px-6 sm:py-4 border border-border space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-[#0066FF]" />
              Basic Information
            </h2>
            
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Name <span className="text-red-500">*</span></span>
                <Button
                  type="button"
                  onClick={handleRandomName}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-[#2952d9] h-auto p-1"
                  title="Random name"
                >
                  <Dices className="w-3 h-3" />
                  Random
                </Button>
              </label>
              <Input
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('name', e.target.value)}
                placeholder="e.g., Alpha Trading Bot"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Description</span>
                <Button
                  type="button"
                  onClick={() => handleGenerateField('description')}
                  disabled={generatingField === 'description'}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-[#2952d9] h-auto p-1 disabled:opacity-50"
                >
                  {generatingField === 'description' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Generate
                    </>
                  )}
                </Button>
              </label>
              <Textarea
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)}
                placeholder="Brief description of your agent's purpose..."
                rows={3}
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Profile Image URL (optional)</label>
              <Input
                value={formData.profileImageUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('profileImageUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Personality Card */}
          <div className="bg-card/50 backdrop-blur rounded-lg px-4 py-3 sm:px-6 sm:py-4 border border-border space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Brain className="w-5 h-5 text-[#0066FF]" />
              Personality & Character
            </h2>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>System Prompt <span className="text-red-500">*</span></span>
                <Button
                  type="button"
                  onClick={() => handleGenerateField('system')}
                  disabled={generatingField === 'system'}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-[#2952d9] h-auto p-1 disabled:opacity-50"
                >
                  {generatingField === 'system' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Generate
                    </>
                  )}
                </Button>
              </label>
              <Textarea
                value={formData.system}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('system', e.target.value)}
                placeholder="You are an AI agent who..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Defines how your agent thinks and behaves
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Bio Points</span>
                <Button
                  type="button"
                  onClick={() => handleGenerateField('bio')}
                  disabled={generatingField === 'bio'}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-[#2952d9] h-auto p-1 disabled:opacity-50"
                >
                  {generatingField === 'bio' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Generate
                    </>
                  )}
                </Button>
              </label>
              {formData.bio.map((bio, idx) => (
                <Input
                  key={idx}
                  value={bio}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const newBio = [...formData.bio]
                    newBio[idx] = e.target.value
                    updateField('bio', newBio)
                  }}
                  placeholder={`Bio point ${idx + 1}`}
                  className="mb-2"
                />
              ))}
              <Button
                type="button"
                onClick={() => updateField('bio', [...formData.bio, ''])}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Bio Point
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Personality</span>
                <Button
                  type="button"
                  onClick={() => handleGenerateField('personality')}
                  disabled={generatingField === 'personality'}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-[#2952d9] h-auto p-1 disabled:opacity-50"
                >
                  {generatingField === 'personality' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Generate
                    </>
                  )}
                </Button>
              </label>
              <Textarea
                value={formData.personality}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('personality', e.target.value)}
                placeholder="Describe your agent's personality traits..."
                rows={3}
              />
            </div>
          </div>

          {/* Trading Strategy Card */}
          <div className="bg-card/50 backdrop-blur rounded-lg px-4 py-3 sm:px-6 sm:py-4 border border-border space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#0066FF]" />
              Trading Configuration
            </h2>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                <span>Trading Strategy</span>
                <Button
                  type="button"
                  onClick={() => handleGenerateField('tradingStrategy')}
                  disabled={generatingField === 'tradingStrategy'}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-[#2952d9] h-auto p-1 disabled:opacity-50"
                >
                  {generatingField === 'tradingStrategy' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Generate
                    </>
                  )}
                </Button>
              </label>
              <Textarea
                value={formData.tradingStrategy}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('tradingStrategy', e.target.value)}
                placeholder="Describe your agent's trading approach and strategy..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will guide autonomous trading decisions
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#0066FF]" />
                Model Tier
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => updateField('modelTier', 'free')}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 border rounded-lg transition-all text-left',
                    'hover:border-[#0066FF]/50 hover:bg-[#0066FF]/5',
                    formData.modelTier === 'free'
                      ? 'border-[#0066FF] bg-[#0066FF]/10'
                      : 'border-border bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#0066FF]" />
                    <span className="font-medium">Free</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Groq 8B • 1 point per message</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('modelTier', 'pro')}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 border rounded-lg transition-all text-left',
                    'hover:border-[#0066FF]/50 hover:bg-[#0066FF]/5',
                    formData.modelTier === 'pro'
                      ? 'border-[#0066FF] bg-[#0066FF]/10'
                      : 'border-border bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#0066FF]" />
                    <span className="font-medium">Pro</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Groq 70B • 1 point per message</div>
                </button>
              </div>
            </div>
          </div>

          {/* Initial Deposit Card */}
          <div className="bg-card/50 backdrop-blur rounded-lg px-4 py-3 sm:px-6 sm:py-4 border border-border space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#0066FF]" />
              Initial Deposit
            </h2>

            <div className="bg-muted/50 p-4 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Your Balance</span>
                </div>
                <span className="font-semibold text-lg">{totalPoints.toLocaleString()} pts</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Deposit Amount (points)
              </label>
              <Input
                type="number"
                value={formData.initialDeposit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('initialDeposit', parseInt(e.target.value) || 0)}
                min={0}
                max={totalPoints}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your agent will need points to chat and trade. You can add more later.
              </p>
            </div>

            <div className="bg-[#0066FF]/10 border border-[#0066FF]/20 rounded-lg p-4">
              <h3 className="font-medium mb-2">Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent Name:</span>
                  <span>{formData.name || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model Tier:</span>
                  <span className="capitalize">{formData.modelTier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial Deposit:</span>
                  <span>{formData.initialDeposit} points</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining Balance:</span>
                  <span>{totalPoints - formData.initialDeposit} points</span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-6 border-t border-border">
            <Button
              type="submit"
              disabled={loading || formData.initialDeposit > totalPoints}
              className={cn(
                'w-full flex items-center justify-center gap-2',
                'bg-[#0066FF] hover:bg-[#2952d9] text-primary-foreground',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'px-6 py-3 rounded-lg font-medium transition-all'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating Agent...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Create Agent</span>
                </>
              )}
            </Button>
            {formData.initialDeposit > totalPoints && (
              <p className="text-sm text-red-500 mt-2 text-center">
                Insufficient balance. You have {totalPoints} points but need {formData.initialDeposit} points.
              </p>
            )}
          </div>
        </form>
      </div>
    </PageContainer>
  )
}
