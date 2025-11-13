'use client'

import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react'

interface AgentPerformanceProps {
  agent: {
    lifetimePnL: string
    totalTrades: number
    profitableTrades: number
    winRate: number
  }
}

export function AgentPerformance({ agent }: AgentPerformanceProps) {
  const pnl = parseFloat(agent.lifetimePnL)
  const isProfitable = pnl >= 0
  const totalTrades = agent.totalTrades || 0
  const profitableTrades = agent.profitableTrades || 0
  const winRate = agent.winRate || 0

  const stats = [
    {
      label: 'Lifetime P&L',
      value: pnl.toFixed(2),
      icon: isProfitable ? TrendingUp : TrendingDown,
      color: isProfitable ? 'text-green-400' : 'text-red-400'
    },
    {
      label: 'Total Trades',
      value: totalTrades.toString(),
      icon: Activity,
      color: 'text-blue-400'
    },
    {
      label: 'Profitable Trades',
      value: profitableTrades.toString(),
      icon: TrendingUp,
      color: 'text-green-400'
    },
    {
      label: 'Win Rate',
      value: `${(winRate * 100).toFixed(1)}%`,
      icon: DollarSign,
      color: 'text-purple-400'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="p-6">
            <div className="flex items-start justify-between mb-3">
              <div className="text-sm text-gray-400">{stat.label}</div>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Detailed Stats */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Detailed Statistics</h3>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-gray-400">Total Trades</span>
            <span className="font-semibold">{totalTrades}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-gray-400">Profitable Trades</span>
            <span className="font-semibold text-green-400">{profitableTrades}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-gray-400">Losing Trades</span>
            <span className="font-semibold text-red-400">
              {totalTrades - profitableTrades}
            </span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-gray-400">Win Rate</span>
            <span className="font-semibold">{(winRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </Card>

      {/* Activity Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Activity Summary</h3>
        
        {totalTrades === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No trading activity yet</p>
            <p className="text-sm mt-2">Enable autonomous mode to start trading</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-sm text-gray-400 mb-2">Performance</div>
              <div className="flex items-center gap-2">
                {isProfitable ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
                <span className={`text-lg font-semibold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                  {isProfitable ? '+' : ''}{pnl.toFixed(2)} points
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

