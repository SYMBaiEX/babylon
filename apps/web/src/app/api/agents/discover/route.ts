/**
 * A2A Agent Discovery Endpoint
 *
 * @route GET /api/agents/discover - Discover available agents
 * @access Public
 *
 * @description
 * Discovers agents based on filters including OASF taxonomy skills and domains.
 * Supports Agent0 SDK v0.31.0 discovery patterns.
 * Set includeExternal=true to also include agents from Agent0 network.
 *
 * @openapi
 * /api/agents/discover:
 *   get:
 *     tags:
 *       - Agents
 *       - A2A Protocol
 *     summary: Discover agents
 *     description: Find agents by type, status, skills, domains, and capabilities. Optionally includes Agent0 network agents.
 *     parameters:
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: Comma-separated agent types (USER_CONTROLLED, NPC, EXTERNAL)
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated OASF skill paths
 *       - in: query
 *         name: domains
 *         schema:
 *           type: string
 *         description: Comma-separated OASF domain paths
 *       - in: query
 *         name: matchMode
 *         schema:
 *           type: string
 *           enum: [any, all]
 *           default: all
 *         description: Match mode for skills/domains filtering
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *       - in: query
 *         name: includeExternal
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include agents from Agent0 network
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Agents discovered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents:
 *                   type: array
 *                 total:
 *                   type: integer
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 *
 * @example
 * ```typescript
 * // Find all trading agents
 * const response = await fetch('/api/agents/discover?skills=finance_and_business/trading');
 * const { agents } = await response.json();
 *
 * // Find agents with specific skills (any match)
 * const response = await fetch(
 *   '/api/agents/discover?skills=dialogue_systems,trading&matchMode=any'
 * );
 * ```
 *
 * @see {@link /lib/services/agent-registry.service} AgentRegistryService
 * @see {@link /lib/utils/oasf-skill-mapper} OASF skill taxonomy
 */

import type { AgentDiscoveryFilter } from '@babylon/agents';
import {
  AgentStatus,
  type AgentSummary,
  AgentType,
  agentRegistry,
  getAgent0SDK,
  type SearchFilters,
} from '@babylon/agents';
import { getBaseUrl, logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Parse query parameters
  const typesParam = searchParams.get('types');
  const skillsParam = searchParams.get('skills');
  const domainsParam = searchParams.get('domains');
  const matchMode = (searchParams.get('matchMode') as 'any' | 'all') || 'all';
  const search = searchParams.get('search') || undefined;
  const includeExternalParam = searchParams.get('includeExternal');
  const includeExternal = includeExternalParam === 'true';
  const limit = Number.parseInt(searchParams.get('limit') || '50');
  const offset = Number.parseInt(searchParams.get('offset') || '0');

  // Build discovery filter
  const filter: AgentDiscoveryFilter = {
    // Parse types (comma-separated string to enum array)
    types: typesParam
      ? (typesParam
          .split(',')
          .filter((t) =>
            Object.values(AgentType).includes(t as AgentType)
          ) as AgentType[])
      : undefined,

    // Only discover active and initialized agents
    statuses: [AgentStatus.ACTIVE, AgentStatus.INITIALIZED],

    // Parse OASF skills (comma-separated)
    requiredSkills: skillsParam
      ? skillsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,

    // Parse OASF domains (comma-separated)
    requiredDomains: domainsParam
      ? domainsParam
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : undefined,

    matchMode,
    search,
    limit,
    offset,
  };

  logger.info(
    'Agent discovery request',
    {
      filter: {
        ...filter,
        types: filter.types?.join(','),
        requiredSkills: filter.requiredSkills?.join(','),
        requiredDomains: filter.requiredDomains?.join(','),
      },
      includeExternal,
    },
    'AgentDiscovery'
  );

  const baseUrl = getBaseUrl();

  // If includeExternal is true, use AgentDiscoveryService for merged results
  if (includeExternal) {
    const sdk = getAgent0SDK();

    const searchFilters: SearchFilters = {
      keyword: filter.search,
      oasfSkills: filter.requiredSkills,
      oasfDomains: filter.requiredDomains,
      active: true,
    };

    const summaries = await sdk.searchAgents(searchFilters);
    const pagedSummaries = summaries.slice(offset, offset + limit);

    const externalAgentCards = pagedSummaries.map((agent: AgentSummary) => {
      const agentId = agent.agentId;
      const tokenId = Number.parseInt(agentId.split(':')[1] ?? '0', 10);
      const externalId = `agent0-${tokenId}`;

      return {
        version: '1.0' as const,
        agentId,
        name: agent.name,
        description: agent.description,
        type: 'EXTERNAL',
        status: agent.active ? 'ACTIVE' : 'INACTIVE',
        trustLevel: agent.averageValue ?? 0,
        endpoints: {
          a2a: agent.a2a ?? `${baseUrl}/api/agents/${externalId}/a2a`,
          mcp: agent.mcp ?? `${baseUrl}/api/agents/${externalId}/mcp`,
          card: agent.web ?? `${baseUrl}/api/agents/${externalId}/card`,
        },
        capabilities: {
          supportedTrusts: agent.supportedTrusts,
          a2aSkills: agent.a2aSkills,
          mcpTools: agent.mcpTools,
          mcpPrompts: agent.mcpPrompts,
          mcpResources: agent.mcpResources,
          oasfSkills: agent.oasfSkills,
          oasfDomains: agent.oasfDomains,
          x402support: agent.x402support,
        },
        authentication: {
          required: false,
          methods: [],
        },
      };
    });

    logger.info(
      `Discovered ${externalAgentCards.length} agents (including external)`,
      {
        totalFound: externalAgentCards.length,
      },
      'AgentDiscovery'
    );

    return NextResponse.json(
      {
        agents: externalAgentCards,
        total: summaries.length,
        offset,
        limit,
        filter: {
          types: filter.types,
          skills: filter.requiredSkills,
          domains: filter.requiredDomains,
          matchMode: filter.matchMode,
          includeExternal,
        },
      },
      { status: 200 }
    );
  }

  // Default: local registry only
  const agents = await agentRegistry.discoverAgents(filter);

  const agentCards = agents.map((agent) => ({
    version: '1.0' as const,
    agentId: agent.agentId,
    name: agent.name,
    description: agent.systemPrompt,
    type: agent.type,
    status: agent.status,
    trustLevel: agent.trustLevel,
    endpoints: {
      a2a:
        agent.capabilities.a2aEndpoint ||
        `${baseUrl}/api/agents/${agent.agentId}/a2a`,
      mcp:
        agent.capabilities.mcpEndpoint ||
        `${baseUrl}/api/agents/${agent.agentId}/mcp`,
      card: `${baseUrl}/api/agents/${agent.agentId}/card`,
    },
    capabilities: agent.capabilities,
    authentication: {
      required: false,
      methods: [],
    },
  }));

  logger.info(
    `Discovered ${agentCards.length} agents`,
    {
      totalFound: agentCards.length,
      skillsCount: filter.requiredSkills?.length || 0,
      domainsCount: filter.requiredDomains?.length || 0,
    },
    'AgentDiscovery'
  );

  return NextResponse.json(
    {
      agents: agentCards,
      total: agentCards.length,
      filter: {
        types: filter.types,
        skills: filter.requiredSkills,
        domains: filter.requiredDomains,
        matchMode: filter.matchMode,
      },
    },
    { status: 200 }
  );
}
