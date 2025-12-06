/**
 * Agent Discovery Endpoint
 *
 * GET /api/agents/external/discover
 *
 * Allows external agents to discover other agents registered on the platform
 * Returns agent capabilities, endpoints, and trust levels
 *
 * @see src/lib/services/agent-registry.service.ts
 */

import type { TrustLevel } from '@babylon/agents';
// import { verifyApiKey } from '@babylon/shared'
// import { db } from '@babylon/db'
import { AgentStatus, AgentType, agentRegistry } from '@babylon/agents';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Discovery filter type
interface DiscoveryFilter {
  types?: AgentType[];
  statuses?: AgentStatus[];
  minTrustLevel?: TrustLevel;
  requiredCapabilities?: string[];
  requiredSkills?: string[];
  requiredDomains?: string[];
  matchMode?: 'all' | 'any';
  limit?: number;
  offset?: number;
}

// Query parameter validation
const DiscoveryQuerySchema = z.object({
  types: z.string().optional(), // Comma-separated: USER_CONTROLLED,NPC,EXTERNAL
  statuses: z.string().optional(), // Comma-separated: ACTIVE,PAUSED
  minTrustLevel: z.coerce.number().min(0).max(4).optional(),
  capabilities: z.string().optional(), // Comma-separated: text-generation,analysis
  skills: z.string().optional(), // Comma-separated OASF skills
  domains: z.string().optional(), // Comma-separated OASF domains
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * Authenticate the request using API key from Authorization header
 */
async function authenticateRequest(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

  const agent = await agentRegistry.verifyExternalAgentApiKey(apiKey);
  return !!agent;
}

/**
 * GET /api/agents/external/discover
 *
 * Discover agents based on filters
 */
export async function GET(req: NextRequest) {
  // Authenticate the request
  const isAuthenticated = await authenticateRequest(req);

  if (!isAuthenticated) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      },
      { status: 401 }
    );
  }

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const query = {
    types: searchParams.get('types') || undefined,
    statuses: searchParams.get('statuses') || undefined,
    minTrustLevel: searchParams.get('minTrustLevel') || undefined,
    capabilities: searchParams.get('capabilities') || undefined,
    skills: searchParams.get('skills') || undefined,
    domains: searchParams.get('domains') || undefined,
    limit: searchParams.get('limit') || undefined,
    offset: searchParams.get('offset') || undefined,
  };

  const validated = DiscoveryQuerySchema.parse(query);

  // Build discovery filter
  const filter: DiscoveryFilter = {};

  // Filter by agent types
  if (validated.types) {
    const types = validated.types.split(',').map((t) => t.trim());
    filter.types = types.filter((t) =>
      Object.values(AgentType).includes(t as AgentType)
    ) as AgentType[];
  }

  // Filter by statuses
  if (validated.statuses) {
    const statuses = validated.statuses.split(',').map((s) => s.trim());
    filter.statuses = statuses.filter((s) =>
      Object.values(AgentStatus).includes(s as AgentStatus)
    ) as AgentStatus[];
  }

  // Filter by minimum trust level
  if (validated.minTrustLevel !== undefined) {
    filter.minTrustLevel = validated.minTrustLevel as TrustLevel;
  }

  // Filter by capabilities (actions)
  if (validated.capabilities) {
    filter.requiredCapabilities = validated.capabilities
      .split(',')
      .map((c) => c.trim());
  }

  // Filter by OASF skills
  if (validated.skills) {
    filter.requiredSkills = validated.skills.split(',').map((s) => s.trim());
  }

  // Filter by OASF domains
  if (validated.domains) {
    filter.requiredDomains = validated.domains.split(',').map((d) => d.trim());
  }

  // Pagination
  filter.limit = validated.limit;
  filter.offset = validated.offset;

  // Discover agents using agent registry
  const agents = await agentRegistry.discoverAgents(filter);

  // Transform agents for external API response
  const results = agents.map((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    trustLevel: agent.trustLevel,
    capabilities: agent.capabilities,
    discoveryMetadata: agent.discoveryMetadata,
    endpoints: agent.discoveryMetadata?.endpoints,
    lastActiveAt: agent.lastActiveAt,
  }));

  return NextResponse.json({
    success: true,
    agents: results,
    pagination: {
      limit: validated.limit,
      offset: validated.offset,
      total: results.length,
    },
    filters: filter,
  });
}

/**
 * POST /api/agents/external/discover
 *
 * Advanced discovery with complex filters (body-based)
 */
export async function POST(req: NextRequest) {
  // Authenticate the request
  const isAuthenticated = await authenticateRequest(req);

  if (!isAuthenticated) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      },
      { status: 401 }
    );
  }

  // Parse request body
  const body = await req.json();

  // Discover agents using agent registry
  const agents = await agentRegistry.discoverAgents(body);

  // Transform agents for external API response
  const results = agents.map((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    trustLevel: agent.trustLevel,
    capabilities: agent.capabilities,
    discoveryMetadata: agent.discoveryMetadata,
    endpoints: agent.discoveryMetadata?.endpoints,
    lastActiveAt: agent.lastActiveAt,
  }));

  return NextResponse.json({
    success: true,
    agents: results,
    pagination: {
      limit: body.limit || 20,
      offset: body.offset || 0,
      total: results.length,
    },
    filters: body,
  });
}
