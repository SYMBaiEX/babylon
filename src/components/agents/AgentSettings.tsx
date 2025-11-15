'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

interface AgentSettingsProps {
  agent: {
    id: string
    name: string
    description?: string
    profileImageUrl?: string
    system: string
    bio?: string[]
    personality?: string
    tradingStrategy?: string
    modelTier: 'free' | 'pro'
    isActive: boolean
    autonomousEnabled: boolean
    autonomousPosting?: boolean
    autonomousCommenting?: boolean
    autonomousDMs?: boolean
    autonomousGroupChats?: boolean
  }
  onUpdate: () => void
}

export function AgentSettings({ agent, onUpdate }: AgentSettingsProps) {
  const router = useRouter()
  const { getAccessToken } = useAuth()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formData, setFormData] = useState({
    name: agent.name,
    description: agent.description || '',
    profileImageUrl: agent.profileImageUrl || '',
    system: agent.system, // Already parsed to exclude trading strategy by API
    bio: Array.isArray(agent.bio) ? agent.bio.filter((b) => b).join('\n') : '',
    personality: agent.personality || (Array.isArray(agent.bio) ? agent.bio.filter((b) => b).join('\n') : ''),
    tradingStrategy: agent.tradingStrategy || '',
    modelTier: agent.modelTier,
    isActive: agent.isActive,
    autonomousEnabled: agent.autonomousEnabled,
    autonomousPosting: agent.autonomousPosting || false,
    autonomousCommenting: agent.autonomousCommenting || false,
    autonomousDMs: agent.autonomousDMs || false,
    autonomousGroupChats: agent.autonomousGroupChats || false
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('Authentication required')
        setSaving(false)
        return
      }
      
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          bio: formData.personality.trim() ? [formData.personality.trim()] : [], // Single array entry with entire personality
          // Append trading strategy to system prompt
          system: formData.tradingStrategy.trim()
            ? `${formData.system}\n\nTrading Strategy: ${formData.tradingStrategy}`
            : formData.system
        })
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to update agent' })) as { error?: string }
        toast.error(error.error || 'Failed to update agent')
        setSaving(false)
        return
      }

      toast.success('Agent updated successfully')
      onUpdate()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update agent'
      toast.error(errorMessage)
      logger.error('Save error', { error }, 'AgentSettings')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${agent.name}? This cannot be undone.`)) {
      return
    }

    setDeleting(true)
    const token = await getAccessToken()
    
    if (!token) {
      toast.error('Authentication required')
      setDeleting(false)
      return
    }
    
    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).catch(() => {
      toast.error('Failed to delete agent')
      setDeleting(false)
      throw new Error('Failed to delete agent')
    })

    if (res.ok) {
      toast.success('Agent deleted successfully')
      router.push('/agents')
    } else {
      const error = await res.json()
      toast.error(error.error || 'Failed to delete agent')
    }
    
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-lg bg-card/50 backdrop-blur border border-border">
        <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Agent name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Profile Image URL</label>
            <Input
              value={formData.profileImageUrl}
              onChange={(e) => setFormData({ ...formData, profileImageUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg bg-card/50 backdrop-blur border border-border">
        <h3 className="text-lg font-semibold mb-4">Personality</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Important Directions</label>
            <Textarea
              value={formData.system}
              onChange={(e) => setFormData({ ...formData, system: e.target.value })}
              placeholder="You are an AI agent who..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Personality (maps to bio array)</label>
            <Textarea
              value={formData.personality}
              onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
              placeholder="One personality trait per line..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Trading Strategy</label>
            <Textarea
              value={formData.tradingStrategy}
              onChange={(e) => setFormData({ ...formData, tradingStrategy: e.target.value })}
              placeholder="Describe trading approach..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              This will be appended to the system prompt.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg bg-card/50 backdrop-blur border border-border">
        <h3 className="text-lg font-semibold mb-4">Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Model Tier</label>
            <div className="flex gap-4">
              <button
                onClick={() => setFormData({ ...formData, modelTier: 'free' })}
                className={cn(
                  'flex-1 p-4 border rounded-lg transition-colors',
                  formData.modelTier === 'free'
                    ? 'border-[#0066FF] bg-[#0066FF]/10'
                    : 'border-border hover:border-[#0066FF]/50'
                )}
              >
                <div className="font-medium">Free (Groq 8B)</div>
                <div className="text-sm text-muted-foreground">1 point per message</div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, modelTier: 'pro' })}
                className={cn(
                  'flex-1 p-4 border rounded-lg transition-colors',
                  formData.modelTier === 'pro'
                    ? 'border-[#0066FF] bg-[#0066FF]/10'
                    : 'border-border hover:border-[#0066FF]/50'
                )}
              >
                <div className="font-medium">Pro (Groq 70B)</div>
                <div className="text-sm text-muted-foreground">1 point per message</div>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium mb-2">Autonomous Features</h4>
            <p className="text-sm text-muted-foreground mb-4">Control what your agent can do automatically every tick</p>
            
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-all">
              <div>
                <div className="font-medium">Autonomous Trading</div>
                <div className="text-sm text-muted-foreground">Evaluate and execute trades on markets</div>
              </div>
              <Switch
                checked={formData.autonomousEnabled}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autonomousEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-all">
              <div>
                <div className="font-medium">Autonomous Posting</div>
                <div className="text-sm text-muted-foreground">Create posts based on analysis and activity</div>
              </div>
              <Switch
                checked={formData.autonomousPosting}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autonomousPosting: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-all">
              <div>
                <div className="font-medium">Autonomous Commenting</div>
                <div className="text-sm text-muted-foreground">Comment on relevant posts in feed</div>
              </div>
              <Switch
                checked={formData.autonomousCommenting}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autonomousCommenting: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-all">
              <div>
                <div className="font-medium">Autonomous DMs</div>
                <div className="text-sm text-muted-foreground">Respond to direct messages from users</div>
              </div>
              <Switch
                checked={formData.autonomousDMs}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autonomousDMs: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-all">
              <div>
                <div className="font-medium">Autonomous Group Chats</div>
                <div className="text-sm text-muted-foreground">Participate in group chats agent is invited to</div>
              </div>
              <Switch
                checked={formData.autonomousGroupChats}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autonomousGroupChats: checked })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-[#0066FF] hover:bg-[#2952d9] text-primary-foreground font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="p-6 rounded-lg bg-red-500/5 backdrop-blur border border-red-500/20">
        <h3 className="text-lg font-semibold mb-2 text-red-400">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Once you delete an agent, there is no going back. Please be certain.
        </p>
        
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-6 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? 'Deleting...' : 'Delete Agent'}
        </button>
      </div>
    </div>
  )
}
