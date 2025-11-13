'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Bot, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function CreateAgentPage() {
  const router = useRouter()
  const { user, authenticated, ready } = useAuth()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    profileImageUrl: '',
    system: '',
    bio: [''],
    personality: '',
    tradingStrategy: '',
    initialDeposit: 100,
    modelTier: 'free' as 'free' | 'pro'
  })

  const updateField = (field: string, value: string | string[] | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const generateField = async (field: 'system' | 'bio' | 'personality' | 'tradingStrategy') => {
    setGenerating(field)
    try {
      // Simple generation based on name and description
      let generated = ''
      switch (field) {
        case 'system':
          generated = `You are ${formData.name}, ${formData.description || 'an AI agent'}. You are helpful, analytical, and focused on achieving the best outcomes. You communicate clearly and concisely.`
          break
        case 'bio':
          generated = `Expert in ${formData.description || 'trading and analysis'}|Data-driven decision maker|Strategic thinker`
          break
        case 'personality':
          generated = `Analytical, strategic, and focused. ${formData.name} approaches problems methodically and values data-driven insights.`
          break
        case 'tradingStrategy':
          generated = `Focus on high-probability opportunities with moderate risk. Analyze market trends and sentiment before making decisions. Prioritize capital preservation while seeking consistent returns.`
          break
      }

      if (field === 'bio') {
        updateField('bio', generated.split('|'))
      } else {
        updateField(field, generated)
      }

      toast.success(`Generated ${field}!`)
    } catch {
      toast.error(`Failed to generate ${field}`)
    } finally {
      setGenerating(null)
    }
  }

  const handleSubmit = async () => {
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
      const token = window.__privyAccessToken
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
        const error = await res.json()
        throw new Error(error.error || 'Failed to create agent')
      }

      const data = await res.json() as { agent: { id: string } }
      toast.success('Agent created successfully!')
      router.push(`/agents/${data.agent.id}`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  if (!ready || !authenticated) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Bot className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-400">Please sign in to create an agent.</p>
        </div>
      </div>
    )
  }

  const totalPoints = user?.reputationPoints || 0

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>
        <h1 className="text-3xl font-bold mb-2">Create New Agent</h1>
        <p className="text-gray-400">
          Step {step} of 4 - Build your AI agent
        </p>
      </div>

      <Card className="p-6">
        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
            
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('name', e.target.value)}
                placeholder="e.g., Alpha Trading Bot"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
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
        )}

        {/* Step 2: Personality */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Personality & Character</h2>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">System Prompt *</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateField('system')}
                  disabled={generating === 'system'}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generating === 'system' ? 'Generating...' : 'Generate'}
                </Button>
              </div>
              <Textarea
                value={formData.system}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('system', e.target.value)}
                placeholder="You are an AI agent who..."
                rows={4}
              />
              <p className="text-xs text-gray-400 mt-1">
                Defines how your agent thinks and behaves
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Bio Points</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateField('bio')}
                  disabled={generating === 'bio'}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generating === 'bio' ? 'Generating...' : 'Generate'}
                </Button>
              </div>
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
                variant="outline"
                size="sm"
                onClick={() => updateField('bio', [...formData.bio, ''])}
              >
                Add Bio Point
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Personality</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateField('personality')}
                  disabled={generating === 'personality'}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generating === 'personality' ? 'Generating...' : 'Generate'}
                </Button>
              </div>
              <Textarea
                value={formData.personality}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('personality', e.target.value)}
                placeholder="Describe your agent's personality traits..."
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 3: Trading Strategy */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Trading Strategy</h2>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Strategy Description</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateField('tradingStrategy')}
                  disabled={generating === 'tradingStrategy'}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generating === 'tradingStrategy' ? 'Generating...' : 'Generate'}
                </Button>
              </div>
              <Textarea
                value={formData.tradingStrategy}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('tradingStrategy', e.target.value)}
                placeholder="Describe your agent's trading approach and strategy..."
                rows={5}
              />
              <p className="text-xs text-gray-400 mt-1">
                This will guide autonomous trading decisions
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Model Tier</label>
              <div className="flex gap-4">
                <button
                  onClick={() => updateField('modelTier', 'free')}
                  className={`flex-1 p-4 border rounded-lg transition-colors ${
                    formData.modelTier === 'free'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">Free (Groq 8B)</div>
                  <div className="text-sm text-gray-400">1 point per message</div>
                </button>
                <button
                  onClick={() => updateField('modelTier', 'pro')}
                  className={`flex-1 p-4 border rounded-lg transition-colors ${
                    formData.modelTier === 'pro'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">Pro (Groq 70B)</div>
                  <div className="text-sm text-gray-400">1 point per message</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Initial Deposit */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Initial Deposit</h2>

            <div className="bg-muted/50 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Your Balance</span>
                <span className="font-semibold">{totalPoints} points</span>
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
              <p className="text-xs text-gray-400 mt-1">
                Your agent will need points to chat and trade. You can add more later.
              </p>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <h3 className="font-medium mb-2">Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Agent Name:</span>
                  <span>{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Model Tier:</span>
                  <span className="capitalize">{formData.modelTier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Initial Deposit:</span>
                  <span>{formData.initialDeposit} points</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Remaining Balance:</span>
                  <span>{totalPoints - formData.initialDeposit} points</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || loading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          {step < 4 ? (
            <Button
              onClick={() => setStep(Math.min(4, step + 1))}
              disabled={loading}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || formData.initialDeposit > totalPoints}
            >
              {loading ? 'Creating...' : 'Create Agent'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

