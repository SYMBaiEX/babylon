/**
 * MCP Authentication
 * 
 * JWT-based authentication for MCP protocol.
 * Replaces weak session tokens with proper JWTs.
 */

import jwt from 'jsonwebtoken'
import { logger } from '@/lib/logger'

export interface MCPAuthToken {
  agentId: string
  userId: string
  tokenId?: number
  iat: number
  exp: number
}

/**
 * Generate MCP authentication JWT token
 */
export function generateMCPToken(agent: { 
  agentId: string
  userId: string
  tokenId?: number 
}): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
  
  if (!secret) {
    throw new Error('JWT_SECRET or NEXTAUTH_SECRET required for MCP authentication')
  }
  
  return jwt.sign(
    {
      agentId: agent.agentId,
      userId: agent.userId,
      tokenId: agent.tokenId,
      type: 'mcp'
    },
    secret,
    { expiresIn: '24h' }
  )
}

/**
 * Verify MCP authentication JWT token
 */
export function verifyMCPToken(token: string): MCPAuthToken | null {
  try {
    const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
    
    if (!secret) {
      logger.error('JWT_SECRET not configured', undefined, 'MCPAuth')
      return null
    }
    
    const decoded = jwt.verify(token, secret) as MCPAuthToken & { type?: string }
    
    // Verify it's an MCP token
    if (decoded.type !== 'mcp') {
      logger.warn('Invalid token type for MCP', { type: decoded.type }, 'MCPAuth')
      return null
    }
    
    return {
      agentId: decoded.agentId,
      userId: decoded.userId,
      tokenId: decoded.tokenId,
      iat: decoded.iat,
      exp: decoded.exp
    }
  } catch (error) {
    logger.warn('MCP token verification failed', error, 'MCPAuth')
    return null
  }
}

/**
 * Refresh MCP token (generate new token with extended expiry)
 */
export function refreshMCPToken(oldToken: string): string | null {
  const decoded = verifyMCPToken(oldToken)
  
  if (!decoded) {
    return null
  }
  
  // Generate new token with same claims
  return generateMCPToken({
    agentId: decoded.agentId,
    userId: decoded.userId,
    tokenId: decoded.tokenId
  })
}

/**
 * Revoke MCP token (add to blacklist)
 */
const revokedTokens: Set<string> = new Set()

export function revokeMCPToken(token: string): void {
  revokedTokens.add(token)
  
  // Clean up old tokens periodically (keep last 10k)
  if (revokedTokens.size > 10000) {
    const toDelete = Array.from(revokedTokens).slice(0, 5000)
    toDelete.forEach(t => revokedTokens.delete(t))
  }
}

export function isTokenRevoked(token: string): boolean {
  return revokedTokens.has(token)
}

