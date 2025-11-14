/**
 * Agent Protocol Compliance API
 * 
 * GET /api/agents/:agentId/compliance - Check agent compliance with Agent0, A2A, MCP
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { optionalAuth } from '@/lib/api/auth-middleware'
import { getComplianceChecker } from '@/lib/protocols/compliance-checker'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    // Optional auth - compliance is public
    await optionalAuth(request).catch(() => null)

    const { agentId } = await params

    const checker = getComplianceChecker()
    const report = await checker.checkCompliance(agentId)

    return NextResponse.json({
      success: true,
      ...report
    })
  } catch (error) {
    console.error('Compliance check failed', error)
    return NextResponse.json({ error: 'Failed to check compliance' }, { status: 500 })
  }
}


