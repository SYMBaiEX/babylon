'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/shared/Avatar'
import { Plus, Bot, TrendingUp, Activity } from 'lucide-react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  description?: string
  profileImageUrl?: string
  pointsBalance: number
  isActive: boolean
  autonomousEnabled: boolean
  modelTier: 'free' | 'pro'
  status: string
  lifetimePnL: string
  totalTrades: number
  winRate: number
  lastTickAt?: string
  lastChatAt?: string
  createdAt: string
}

export default function AgentsPage() {
  const { authenticated, ready } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'idle'>('all')

  useEffect(() => {
    if (ready && authenticated) {
      fetchAgents()
    }
  }, [ready, authenticated, filter])

  const fetchAgents = async () => {
    try {
      setLoading(true)
      const token = window.__privyAccessToken
      
      let url = '/api/agents'
      if (filter === 'active') {
        url += '?autonomousEnabled=true'
      } else if (filter === 'idle') {
        url += '?autonomousEnabled=false'
      }

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!ready || !authenticated) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Bot className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-400">Please sign in to view your agents.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Agents</h1>
          <p className="text-gray-400">
            Create and manage AI agents that can chat and trade autonomously
          </p>
        </div>
        <Link href="/agents/create">
          <Button className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Agent
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
          size="sm"
        >
          All
        </Button>
        <Button
          variant={filter === 'active' ? 'default' : 'outline'}
          onClick={() => setFilter('active')}
          size="sm"
        >
          Active
        </Button>
        <Button
          variant={filter === 'idle' ? 'default' : 'outline'}
          onClick={() => setFilter('idle')}
          size="sm"
        >
          Idle
        </Button>
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-700 rounded w-24 mb-2" />
                  <div className="h-3 bg-gray-700 rounded w-16" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-700 rounded" />
                <div className="h-3 bg-gray-700 rounded w-3/4" />
              </div>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Bot className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold mb-2">No agents yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first AI agent to start trading and chatting
            </p>
            <Link href="/agents/create">
              <Button>
                <Plus className="w-5 h-5 mr-2" />
                Create Your First Agent
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                  <Avatar
                    id={agent.id}
                    name={agent.name}
                    type="user"
                    size="lg"
                    src={agent.profileImageUrl}
                    imageUrl={agent.profileImageUrl}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{agent.name}</h3>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={agent.autonomousEnabled ? 'text-green-400' : 'text-gray-400'}>
                        {agent.autonomousEnabled ? (
                          <>
                            <Activity className="w-3 h-3 inline mr-1" />
                            Active
                          </>
                        ) : (
                          'Idle'
                        )}
                      </span>
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-400 capitalize">{agent.modelTier}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {agent.description && (
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {agent.description}
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Balance</div>
                    <div className="font-semibold">{agent.pointsBalance} pts</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">P&L</div>
                    <div className={`font-semibold flex items-center gap-1 ${
                      parseFloat(agent.lifetimePnL) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      <TrendingUp className="w-3 h-3" />
                      {parseFloat(agent.lifetimePnL).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Trades</div>
                    <div className="font-semibold">{agent.totalTrades}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                    <div className="font-semibold">{(agent.winRate * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

