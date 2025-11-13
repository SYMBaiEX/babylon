'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowDownToLine, ArrowUpFromLine, History } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

interface Transaction {
  id: string
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  description: string
  createdAt: string
}

interface AgentWalletProps {
  agent: {
    id: string
    name: string
    pointsBalance: number
    totalDeposited: number
    totalWithdrawn: number
    totalPointsSpent: number
  }
  onUpdate: () => void
}

export function AgentWallet({ agent, onUpdate }: AgentWalletProps) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchTransactions()
  }, [agent.id])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const token = window.__privyAccessToken
      
      const res = await fetch(`/api/agents/${agent.id}/wallet`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions)
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTransaction = async () => {
    const amountNum = parseInt(amount)
    
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    const totalPoints = user?.reputationPoints || 0
    
    if (action === 'deposit' && amountNum > totalPoints) {
      toast.error(`Insufficient balance. You have ${totalPoints} points`)
      return
    }

    if (action === 'withdraw' && amountNum > agent.pointsBalance) {
      toast.error(`Insufficient agent balance. Agent has ${agent.pointsBalance} points`)
      return
    }

    setProcessing(true)
    try {
      const token = window.__privyAccessToken
      
      const res = await fetch(`/api/agents/${agent.id}/wallet`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, amount: amountNum })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Transaction failed')
      }

      const data = await res.json()
      toast.success(data.message)
      setAmount('')
      fetchTransactions()
      onUpdate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Transaction failed')
    } finally {
      setProcessing(false)
    }
  }

  const userTotalPoints = user?.reputationPoints || 0

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-400 mb-2">Agent Balance</div>
          <div className="text-3xl font-bold mb-4">{agent.pointsBalance} pts</div>
          <div className="space-y-1 text-sm text-gray-400">
            <div className="flex justify-between">
              <span>Total Deposited:</span>
              <span>{agent.totalDeposited} pts</span>
            </div>
            <div className="flex justify-between">
              <span>Total Withdrawn:</span>
              <span>{agent.totalWithdrawn} pts</span>
            </div>
            <div className="flex justify-between">
              <span>Total Spent:</span>
              <span>{agent.totalPointsSpent} pts</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-400 mb-2">Your Balance</div>
          <div className="text-3xl font-bold mb-4">{userTotalPoints} pts</div>
          <p className="text-sm text-gray-400">
            Available for deposit to agents
          </p>
        </Card>
      </div>

      {/* Transaction Form */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Transfer Points</h3>
        
        <div className="flex gap-2 mb-4">
          <Button
            variant={action === 'deposit' ? 'default' : 'outline'}
            onClick={() => setAction('deposit')}
            className="flex-1"
          >
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Deposit
          </Button>
          <Button
            variant={action === 'withdraw' ? 'default' : 'outline'}
            onClick={() => setAction('withdraw')}
            className="flex-1"
          >
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Withdraw
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount..."
            min={1}
            max={action === 'deposit' ? userTotalPoints : agent.pointsBalance}
          />
          <Button onClick={handleTransaction} disabled={processing || !amount}>
            {processing ? 'Processing...' : action === 'deposit' ? 'Deposit' : 'Withdraw'}
          </Button>
        </div>

        <p className="text-xs text-gray-400 mt-2">
          {action === 'deposit' 
            ? `Transfer points from your account to ${agent.name}`
            : `Transfer points from ${agent.name} to your account`
          }
        </p>
      </Card>

      {/* Transaction History */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Transaction History</h3>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-8">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center text-gray-400 py-8">No transactions yet</div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium capitalize">{tx.type.replace('_', ' ')}</div>
                  <div className="text-sm text-gray-400">{tx.description}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(tx.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${
                    tx.amount > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount} pts
                  </div>
                  <div className="text-xs text-gray-400">
                    Balance: {tx.balanceAfter} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

