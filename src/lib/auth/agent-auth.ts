/**
 * Agent Authentication Utilities
 *
 * Provides session management and verification for Babylon agents
 */

import { logger } from '@/lib/logger';

export interface AgentSession {
  sessionToken: string;
  agentId: string;
  expiresAt: number;
}

// In-memory session storage (in production, use Redis or database)
const agentSessions = new Map<string, AgentSession>();

// Session duration: 24 hours
const SESSION_DURATION = 24 * 60 * 60 * 1000;

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  const tokensToDelete: string[] = [];

  agentSessions.forEach((session, token) => {
    if (now > session.expiresAt) {
      tokensToDelete.push(token);
    }
  });

  tokensToDelete.forEach(token => agentSessions.delete(token));
}

/**
 * Verify agent credentials against environment configuration
 */
export function verifyAgentCredentials(agentId: string, agentSecret: string): boolean {
  // Get configured agent credentials from environment
  const configuredAgentId = process.env.BABYLON_AGENT_ID || 'babylon-agent-alice';
  const configuredAgentSecret = process.env.BABYLON_AGENT_SECRET;

  if (!configuredAgentSecret) {
    logger.error('BABYLON_AGENT_SECRET not configured in environment', undefined, 'AgentAuth');
    return false;
  }

  return agentId === configuredAgentId && agentSecret === configuredAgentSecret;
}

/**
 * Create a new agent session
 */
export function createAgentSession(agentId: string, sessionToken: string): AgentSession {
  const expiresAt = Date.now() + SESSION_DURATION;
  const session: AgentSession = {
    sessionToken,
    agentId,
    expiresAt,
  };
  agentSessions.set(sessionToken, session);
  return session;
}

/**
 * Verify agent session token
 */
export function verifyAgentSession(sessionToken: string): { agentId: string } | null {
  const session = agentSessions.get(sessionToken);

  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    agentSessions.delete(sessionToken);
    return null;
  }

  return { agentId: session.agentId };
}

/**
 * Get session duration in milliseconds
 */
export function getSessionDuration(): number {
  return SESSION_DURATION;
}
