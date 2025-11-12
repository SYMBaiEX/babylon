/**
 * Agent Session Manager
 * 
 * Manages authentication sessions for Babylon agents
 * Stores tokens in memory, handles refresh logic
 */

import type { AgentSession } from '../types/agent-config'

const sessions = new Map<string, AgentSession>()

interface AuthResponse {
  success: boolean
  sessionToken: string
  expiresAt: number
  expiresIn: number
}

/**
 * Get or create session for agent
 */
export async function getOrCreateSession(
  agentId: string,
  agentSecret: string,
  apiBaseUrl: string
): Promise<string> {
  const existingSession = sessions.get(agentId)
  
  if (existingSession && Date.now() < existingSession.expiresAt - 60000) {
    return existingSession.sessionToken
  }
  
  const response = await fetch(`${apiBaseUrl}/api/agents/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId,
      agentSecret,
    }),
  })
  
  const data = await response.json() as AuthResponse
  
  const session: AgentSession = {
    agentId,
    sessionToken: data.sessionToken,
    expiresAt: data.expiresAt,
    createdAt: Date.now(),
  }
  
  sessions.set(agentId, session)
  
  return session.sessionToken
}

/**
 * Refresh session token if needed
 */
export async function refreshSession(
  agentId: string,
  agentSecret: string,
  apiBaseUrl: string
): Promise<string> {
  sessions.delete(agentId)
  return await getOrCreateSession(agentId, agentSecret, apiBaseUrl)
}

/**
 * Clear session for agent
 */
export function clearSession(agentId: string): void {
  sessions.delete(agentId)
}

/**
 * Get current session token without refresh
 */
export function getSessionToken(agentId: string): string | null {
  const session = sessions.get(agentId)
  
  if (!session || Date.now() >= session.expiresAt) {
    return null
  }
  
  return session.sessionToken
}


