/**
 * Agent Authentication API
 *
 * Provides authentication for Babylon agents without requiring user Privy tokens.
 * Uses internal agent credentials stored securely in environment variables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

interface AgentAuthRequest {
  agentId: string;
  agentSecret: string;
}

interface AgentSession {
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
function cleanupExpiredSessions(): void {
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
function verifyAgentCredentials(agentId: string, agentSecret: string): boolean {
  // Get configured agent credentials from environment
  const configuredAgentId = process.env.BABYLON_AGENT_ID || 'babylon-agent-alice';
  const configuredAgentSecret = process.env.BABYLON_AGENT_SECRET;

  if (!configuredAgentSecret) {
    console.error('BABYLON_AGENT_SECRET not configured in environment');
    return false;
  }

  return agentId === configuredAgentId && agentSecret === configuredAgentSecret;
}

/**
 * POST /api/agents/auth
 * Authenticate agent and receive session token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AgentAuthRequest;
    const { agentId, agentSecret } = body;

    // Validate request
    if (!agentId || !agentSecret) {
      return NextResponse.json(
        { error: 'Missing agentId or agentSecret' },
        { status: 400 }
      );
    }

    // Verify agent credentials
    if (!verifyAgentCredentials(agentId, agentSecret)) {
      return NextResponse.json(
        { error: 'Invalid agent credentials' },
        { status: 401 }
      );
    }

    // Clean up old sessions
    cleanupExpiredSessions();

    // Generate session token
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_DURATION;

    // Store session
    agentSessions.set(sessionToken, {
      sessionToken,
      agentId,
      expiresAt,
    });

    console.log(`Agent ${agentId} authenticated successfully`);

    return NextResponse.json({
      success: true,
      sessionToken,
      expiresAt,
      expiresIn: SESSION_DURATION / 1000, // seconds
    });
  } catch (error) {
    console.error('Agent authentication error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
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
