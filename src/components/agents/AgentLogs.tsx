'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Filter } from 'lucide-react'

interface Log {
  id: string
  type: string
  level: string
  message: string
  prompt?: string
  completion?: string
  thinking?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

interface AgentLogsProps {
  agentId: string
}

export function AgentLogs({ agentId }: AgentLogsProps) {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchLogs()
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
  }, [agentId, typeFilter, levelFilter])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const token = window.__privyAccessToken
      
      let url = `/api/agents/${agentId}/logs?limit=100`
      if (typeFilter !== 'all') url += `&type=${typeFilter}`
      if (levelFilter !== 'all') url += `&level=${levelFilter}`

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (logId: string) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId)
    } else {
      newExpanded.add(logId)
    }
    setExpanded(newExpanded)
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'debug': return 'text-gray-400'
      default: return 'text-blue-400'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'error': return 'bg-red-500/10'
      case 'trade': return 'bg-green-500/10'
      case 'chat': return 'bg-blue-500/10'
      case 'tick': return 'bg-purple-500/10'
      default: return 'bg-gray-500/10'
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-muted rounded-lg"
          >
            <option value="all">All Types</option>
            <option value="chat">Chat</option>
            <option value="tick">Tick</option>
            <option value="trade">Trade</option>
            <option value="error">Error</option>
            <option value="system">System</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 bg-muted rounded-lg"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </Card>

      {/* Logs */}
      <Card className="p-4">
        {logs.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No logs found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-3 rounded-lg ${getTypeColor(log.type)} border border-border/50`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono uppercase ${getLevelColor(log.level)}`}>
                        {log.level}
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs uppercase text-gray-400">{log.type}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm">{log.message}</div>
                    
                    {(log.prompt || log.completion || log.thinking || log.metadata) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(log.id)}
                        className="mt-2 text-xs"
                      >
                        {expanded.has(log.id) ? 'Hide Details' : 'Show Details'}
                      </Button>
                    )}

                    {expanded.has(log.id) && (
                      <div className="mt-3 space-y-2 text-xs">
                        {log.prompt && (
                          <div>
                            <div className="font-medium text-gray-400 mb-1">Prompt:</div>
                            <pre className="bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                              {log.prompt}
                            </pre>
                          </div>
                        )}
                        {log.completion && (
                          <div>
                            <div className="font-medium text-gray-400 mb-1">Completion:</div>
                            <pre className="bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                              {log.completion}
                            </pre>
                          </div>
                        )}
                        {log.thinking && (
                          <div>
                            <div className="font-medium text-gray-400 mb-1">Thinking:</div>
                            <pre className="bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                              {log.thinking}
                            </pre>
                          </div>
                        )}
                        {log.metadata && (
                          <div>
                            <div className="font-medium text-gray-400 mb-1">Metadata:</div>
                            <pre className="bg-black/30 p-2 rounded overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
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

