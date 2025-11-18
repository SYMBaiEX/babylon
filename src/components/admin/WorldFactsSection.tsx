'use client'

import { useEffect, useState, useCallback } from 'react'
import { Globe, RefreshCw, Newspaper, Edit, Save, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/shared/Skeleton'

/**
 * World fact structure for world facts section.
 */
interface WorldFact {
  id: string
  value: string
  category?: string
  isActive: boolean
  lastUpdated: string
}

/**
 * World facts data structure from API.
 */
interface WorldFactsData {
  facts: WorldFact[]
  recentParodies: Array<{
    id: string
    parodyTitle: string
    originalTitle: string
    generatedAt: string
  }>
  context: {
    crypto: string
    politics: string
    economy: string
    technology: string
    general: string
    headlines?: string
  }
}

/**
 * World facts section component for managing world facts and context.
 * 
 * Provides interface for viewing, editing, adding, and managing world facts
 * used for reality grounding. Shows recent parodies and context information.
 * Includes fact editing, activation/deactivation, and category management.
 * 
 * Features:
 * - World facts list
 * - Fact editing
 * - Add fact functionality
 * - Activate/deactivate facts
 * - Recent parodies display
 * - Context display
 * - Loading states
 * - Error handling
 * 
 * @returns World facts section element
 */
export function WorldFactsSection() {
  const [data, setData] = useState<WorldFactsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [editingFact, setEditingFact] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [newFactValue, setNewFactValue] = useState<string>('')

  const fetchData = useCallback(async () => {
    const response = await fetch('/api/admin/world-facts')
    if (!response.ok) {
      setError('Failed to fetch world facts')
      setLoading(false)
      return
    }
    const result = await response.json()
    setData(result)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAction = async (action: string, actionData?: Record<string, unknown>) => {
    setActionLoading(true)
    const response = await fetch('/api/admin/world-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data: actionData }),
    })

    if (!response.ok) {
      setError(`Failed to ${action}`)
      setActionLoading(false)
      return
    }

    await fetchData()
    setActionLoading(false)
  }

  const startEditing = (fact: WorldFact) => {
    setEditingFact(fact.id)
    setEditValue(fact.value)
  }

  const saveEdit = async (fact: WorldFact) => {
    await handleAction('update_fact', {
      id: fact.id,
      value: editValue,
    })
    setEditingFact(null)
    setEditValue('')
  }

  const [newFactCategory, setNewFactCategory] = useState<'general' | 'reality-grounding'>('general')

  const addFact = async () => {
    if (!newFactValue.trim()) return
    await handleAction('add_fact', {
      value: newFactValue.trim(),
      category: newFactCategory,
    })
    setNewFactValue('')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center text-red-500 p-8">
        {error || 'Failed to load world facts'}
      </div>
    )
  }


  return (
    <div className="space-y-6">
      {/* World Facts Header */}
      <div className="bg-gradient-to-br from-card to-accent/20 border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue-500" />
              World Facts & Context
            </h3>
            <p className="text-sm text-muted-foreground">
              Manage general world state, RSS feeds, and parody headlines for game context
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData()}
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', actionLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => handleAction('fetch_rss')}
            disabled={actionLoading}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-orange-500/20 text-orange-500 hover:bg-orange-500/30 transition-colors disabled:opacity-50"
          >
            <Newspaper className="w-5 h-5" />
            Fetch RSS Feeds
          </button>

          <button
            onClick={() => handleAction('generate_parodies')}
            disabled={actionLoading}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-500/20 text-purple-500 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          >
            <Zap className="w-5 h-5" />
            Generate Parodies
          </button>

          <button
            onClick={() => handleAction('refresh_mappings')}
            disabled={actionLoading}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh Mappings
          </button>
        </div>
      </div>

      {/* World Facts */}
      <div className="space-y-6">
        {/* General World Facts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
              World Facts
            </h4>
          </div>

          {/* Add New Fact */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex gap-2">
              <select
                value={newFactCategory}
                onChange={(e) => setNewFactCategory(e.target.value as 'general' | 'reality-grounding')}
                className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="general">World Fact</option>
                <option value="reality-grounding">Reality Grounding</option>
              </select>
              <textarea
                value={newFactValue}
                onChange={(e) => setNewFactValue(e.target.value)}
                placeholder="Add a new fact (e.g., 'Bitcoin Price: ~$100,000')"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    addFact()
                  }
                }}
              />
              <button
                onClick={addFact}
                disabled={actionLoading || !newFactValue.trim()}
                className="px-4 py-2 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Facts List */}
          <div className="space-y-2">
            {data.facts.filter(f => f.category === 'general' || !f.category).map(fact => (
              <div
                key={fact.id}
                className="flex items-start justify-between gap-4 p-3 rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  {editingFact === fact.id ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      rows={3}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">{fact.value}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Last updated: {new Date(fact.lastUpdated).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingFact === fact.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(fact)}
                        disabled={actionLoading}
                        className="p-2 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingFact(null)
                          setEditValue('')
                        }}
                        className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(fact)}
                        className="p-2 rounded-lg bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction('delete_fact', { id: fact.id })}
                        disabled={actionLoading}
                        className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reality Grounding Facts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
              Reality Grounding Facts
            </h4>
          </div>

          {/* Facts List */}
          <div className="space-y-2">
            {data.facts.filter(f => f.category === 'reality-grounding').map(fact => (
              <div
                key={fact.id}
                className="flex items-start justify-between gap-4 p-3 rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  {editingFact === fact.id ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      rows={3}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">{fact.value}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Last updated: {new Date(fact.lastUpdated).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingFact === fact.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(fact)}
                        disabled={actionLoading}
                        className="p-2 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingFact(null)
                          setEditValue('')
                        }}
                        className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(fact)}
                        className="p-2 rounded-lg bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction('delete_fact', { id: fact.id })}
                        disabled={actionLoading}
                        className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Parody Headlines */}
      {data.recentParodies.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recent Parody Headlines
          </h4>

          <div className="space-y-2">
            {data.recentParodies.map(parody => (
              <div key={parody.id} className="p-3 rounded-lg bg-accent/30">
                <div className="font-medium text-sm mb-1">{parody.parodyTitle}</div>
                <div className="text-xs text-muted-foreground">
                  Original: {parody.originalTitle}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Generated: {new Date(parody.generatedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


