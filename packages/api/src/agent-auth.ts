/**
 * Agent Authentication Utilities
 *
 * @description Provides session management and verification for Babylon agents.
 * Supports pluggable session stores (Redis, in-memory, etc.).
 * Sessions expire after 24 hours and are automatically cleaned up.
 */

import { logger } from '@babylon/shared';

/**
 * Agent session information
 */
export interface AgentSession {
  sessionToken: string;
  agentId: string;
  expiresAt: number;
}

/**
 * Session store interface for pluggable storage backends
 */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// In-memory session storage (default fallback)
const agentSessions = new Map<string, AgentSession>();

// Session duration: 24 hours
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const SESSION_PREFIX = 'agent:session:';
const DEFAULT_TEST_AGENT_ID = 'babylon-agent-alice';
const isProduction = process.env.NODE_ENV === 'production';

// Configurable session store - defaults to in-memory
let sessionStore: SessionStore | null = null;

/**
 * Configure a custom session store (e.g., Redis)
 */
export function setSessionStore(store: SessionStore | null): void {
  sessionStore = store;
}

/**
 * In-memory session store implementation
 */
const inMemoryStore: SessionStore = {
  async get(key: string): Promise<string | null> {
    const session = agentSessions.get(key.replace(SESSION_PREFIX, ''));
    return session ? JSON.stringify(session) : null;
  },
  async set(key: string, value: string, _ttlMs: number): Promise<void> {
    const session = JSON.parse(value) as AgentSession;
    agentSessions.set(key.replace(SESSION_PREFIX, ''), session);
  },
  async delete(key: string): Promise<void> {
    agentSessions.delete(key.replace(SESSION_PREFIX, ''));
  },
};

/**
 * Get the current session store
 */
function getStore(): SessionStore {
  return sessionStore ?? inMemoryStore;
}

/**
 * Clean up expired sessions (for in-memory store)
 */
export function cleanupExpiredSessions(): void {
  if (sessionStore) {
    // External stores (Redis) handle expiration automatically
    return;
  }

  const now = Date.now();
  const tokensToDelete: string[] = [];

  agentSessions.forEach((session, token) => {
    if (now > session.expiresAt) {
      tokensToDelete.push(token);
    }
  });

  tokensToDelete.forEach((token) => agentSessions.delete(token));
}

/**
 * Verify agent credentials against environment configuration
 */
export function verifyAgentCredentials(
  agentId: string,
  agentSecret: string
): boolean {
  const configuredAgentId =
    process.env.BABYLON_AGENT_ID ??
    (!isProduction ? DEFAULT_TEST_AGENT_ID : undefined);
  const configuredAgentSecret = process.env.CRON_SECRET;

  if (!configuredAgentSecret) {
    logger.error(
      'CRON_SECRET not configured in environment',
      undefined,
      'AgentAuth'
    );
    return false;
  }

  if (!configuredAgentId) {
    logger.error(
      'BABYLON_AGENT_ID must be configured in production environments',
      undefined,
      'AgentAuth'
    );
    return false;
  }

  return agentId === configuredAgentId && agentSecret === configuredAgentSecret;
}

/**
 * Create a new agent session
 */
export async function createAgentSession(
  agentId: string,
  sessionToken: string
): Promise<AgentSession> {
  const expiresAt = Date.now() + SESSION_DURATION;
  const session: AgentSession = {
    sessionToken,
    agentId,
    expiresAt,
  };

  const store = getStore();
  const key = `${SESSION_PREFIX}${sessionToken}`;
  await store.set(key, JSON.stringify(session), SESSION_DURATION);

  return session;
}

/**
 * Verify agent session token
 */
export async function verifyAgentSession(
  sessionToken: string
): Promise<{ agentId: string } | null> {
  const store = getStore();
  const key = `${SESSION_PREFIX}${sessionToken}`;

  const stored = await store.get(key);
  if (stored) {
    const session = JSON.parse(stored) as AgentSession;
    if (Date.now() <= session.expiresAt) {
      return { agentId: session.agentId };
    }
    // Session expired - delete it
    await store.delete(key);
    return null;
  }

  return null;
}

/**
 * Get session duration in milliseconds
 */
export function getSessionDuration(): number {
  return SESSION_DURATION;
}
