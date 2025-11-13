'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/shared/Avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Bot, ArrowLeft, MessageCircle, Activity, TrendingUp, FileText, Settings, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AgentChat } from '@/components/agents/AgentChat'
import { AgentWallet } from '@/components/agents/AgentWallet'
import { AgentLogs } from '@/components/agents/AgentLogs'
import { AgentSettings } from '@/components/agents/AgentSettings'
import { AgentPerformance } from '@/components/agents/AgentPerformance'

interface Agent {
  id: string
  name: string
  description?: string
  profileImageUrl?: string
  system: string
  bio?: string[]
  personality?: string
  tradingStrategy?: string
  pointsBalance: number
  totalDeposited: number
  totalWithdrawn: number
  totalPointsSpent: number
  isActive: boolean
  autonomousEnabled: boolean
  modelTier: 'free' | 'pro'
  status: string
  errorMessage?: string
  lifetimePnL: string
  totalTrades: number
  profitableTrades: number
  winRate: number
  lastTickAt?: string
  lastChatAt?: string
  walletAddress?: string
  agent0TokenId?: number
  onChainRegistered: boolean
  createdAt: string
  updatedAt: string
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { authenticated, ready } = useAuth()
  const agentId = params.agentId as string
  
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (ready && authenticated && agentId) {
      fetchAgent()
    }
  }, [ready, authenticated, agentId])

  const fetchAgent = async () => {
    try {
      setLoading(true)
      const token = window.__privyAccessToken
      
      const res = await fetch(`/api/agents/${agentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        setAgent(data.agent)
      } else {
        toast.error('Agent not found')
        router.push('/agents')
      }
    } catch {
      toast.error('Failed to load agent')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${agent?.name}? This cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      const token = window.__privyAccessToken
      
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        toast.success('Agent deleted successfully')
        router.push('/agents')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to delete agent')
      }
    } catch {
      toast.error('Failed to delete agent')
    } finally {
      setDeleting(false)
    }
  }

  if (!ready || !authenticated) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Bot className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-400">Please sign in to view this agent.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-gray-700 rounded-lg" />
          <div className="h-96 bg-gray-700 rounded-lg" />
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Bot className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-400 mb-4">Agent not found</p>
          <Link href="/agents">
            <Button>Back to Agents</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>
      </div>

      {/* Agent Info Card */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              id={agent.id}
              name={agent.name}
              type="user"
              size="lg"
              src={agent.profileImageUrl}
              imageUrl={agent.profileImageUrl}
            />
            <div>
              <h1 className="text-2xl font-bold mb-1">{agent.name}</h1>
              {agent.description && (
                <p className="text-gray-400 mb-2">{agent.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <span className={agent.autonomousEnabled ? 'text-green-400' : 'text-gray-400'}>
                  {agent.autonomousEnabled ? (
                    <>
                      <Activity className="w-3 h-3 inline mr-1" />
                      Autonomous Active
                    </>
                  ) : (
                    'Autonomous Disabled'
                  )}
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400 capitalize">{agent.modelTier} Mode</span>
                {agent.onChainRegistered && (
                  <>
                    <span className="text-gray-600">•</span>
                    <span className="text-blue-400">Agent0 #{agent.agent0TokenId}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <div>
            <div className="text-xs text-gray-400 mb-1">Balance</div>
            <div className="text-xl font-semibold">{agent.pointsBalance} pts</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">P&L</div>
            <div className={`text-xl font-semibold ${
              parseFloat(agent.lifetimePnL) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {parseFloat(agent.lifetimePnL).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Trades</div>
            <div className="text-xl font-semibold">{agent.totalTrades}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Win Rate</div>
            <div className="text-xl font-semibold">{(agent.winRate * 100).toFixed(0)}%</div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="chat">
            <MessageCircle className="w-4 h-4 mr-2" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="performance">
            <TrendingUp className="w-4 h-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="logs">
            <FileText className="w-4 h-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="wallet">
            <Bot className="w-4 h-4 mr-2" />
            Wallet
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="chat">
            <AgentChat agent={agent} onUpdate={fetchAgent} />
          </TabsContent>

          <TabsContent value="performance">
            <AgentPerformance agent={agent} />
          </TabsContent>

          <TabsContent value="logs">
            <AgentLogs agentId={agent.id} />
          </TabsContent>

          <TabsContent value="settings">
            <AgentSettings agent={agent} onUpdate={fetchAgent} />
          </TabsContent>

          <TabsContent value="wallet">
            <AgentWallet agent={agent} onUpdate={fetchAgent} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

