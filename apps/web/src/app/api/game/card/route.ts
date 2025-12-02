/**
 * Game Agent Card Endpoint
 *
 * Returns the Babylon game's A2A agent card for discovery
 * Allows external agents to discover game capabilities
 *
 * @see agent-patch-plan.md Phase 3.1
 */

import { NextResponse } from 'next/server';
import { babylonAgentCard } from '@babylon/a2a';

export const dynamic = 'force-dynamic';

/**
 * GET /api/game/card
 * Returns the Babylon game agent card
 */
export async function GET() {
  return NextResponse.json(babylonAgentCard, {
    headers: {
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Content-Type': 'application/json',
    },
  });
}
