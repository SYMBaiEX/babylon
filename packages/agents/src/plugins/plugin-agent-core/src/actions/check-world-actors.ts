/**
 * CHECK_WORLD_ACTORS Action
 *
 * Returns the world actors (parody names) that exist in the Babylon universe.
 * These are the NPCs and entities that agents can reference in posts.
 */

import { loadActorsData, StaticDataRegistry } from '@babylon/engine';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

export const checkWorldActorsAction: Action = {
  name: 'CHECK_WORLD_ACTORS',
  description:
    'Check world actors (parody names of celebrities, influencers, etc.) in the Babylon universe',
  parameters: {
    limit: {
      type: 'number',
      description: 'Number of actors to show (default: 20, max: 50)',
      required: false,
    },
    category: {
      type: 'string',
      description:
        'Filter by category: "tech", "finance", "crypto", "all" (default: "all")',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Who are the actors in this world?' },
      },
      {
        name: 'assistant',
        content: { text: "I'll show you the world actors." },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'What parody names can I use?' },
      },
      {
        name: 'assistant',
        content: { text: 'Let me fetch the available world actors.' },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const actionParams = state?.data?.actionParams as
      | { limit?: number; category?: string }
      | undefined;
    const limit = Math.min(Math.max(actionParams?.limit ?? 20, 1), 50);
    const category = actionParams?.category ?? 'all';

    try {
      // Get actors from static data
      const actorsData = loadActorsData({
        includeActors: true,
        includeOrganizations: true,
      });

      const actors = actorsData.actors as Array<{
        id: string;
        name: string;
        username: string;
        category?: string;
        bio?: string;
      }>;

      // Get organizations (companies) as well
      const organizations = StaticDataRegistry.getAllOrganizations()
        .filter((o) => o.type === 'company')
        .slice(0, 10);

      // Filter by category if specified
      let filteredActors = actors;
      if (category !== 'all') {
        filteredActors = actors.filter(
          (a) => a.category?.toLowerCase() === category.toLowerCase()
        );
      }

      // Limit results
      const displayedActors = filteredActors.slice(0, limit);

      if (displayedActors.length === 0) {
        return {
          success: true,
          text: `No actors found${category !== 'all' ? ` in category "${category}"` : ''}.`,
          data: { actors: [], count: 0 },
          values: { actors: [], count: 0, hasActors: false },
        };
      }

      // Format actors
      const formattedActors = displayedActors.map((a) => ({
        name: a.name,
        username: a.username,
        category: a.category ?? 'general',
      }));

      // Format organizations/companies
      const formattedOrgs = organizations.map((o) => ({
        name: o.name,
        ticker: o.ticker,
        type: 'company',
      }));

      // Build response text
      const sections: string[] = [];

      sections.push(`**World Actors (${formattedActors.length}):**`);
      const actorsList = formattedActors
        .map((a) => `• ${a.name} (@${a.username})`)
        .join('\n');
      sections.push(actorsList);

      if (formattedOrgs.length > 0) {
        sections.push('');
        sections.push(`**Companies/Organizations (${formattedOrgs.length}):**`);
        const orgsList = formattedOrgs
          .map((o) => `• ${o.name} (${o.ticker})`)
          .join('\n');
        sections.push(orgsList);
      }

      const responseText = sections.join('\n');

      logger.info(
        `[CHECK_WORLD_ACTORS] Retrieved ${formattedActors.length} actors, ${formattedOrgs.length} orgs`,
        undefined,
        'CheckWorldActors'
      );

      return {
        success: true,
        text: responseText,
        data: {
          actors: formattedActors,
          organizations: formattedOrgs,
          actorCount: formattedActors.length,
          orgCount: formattedOrgs.length,
        },
        values: {
          actors: formattedActors,
          organizations: formattedOrgs,
          actorCount: formattedActors.length,
          orgCount: formattedOrgs.length,
          hasActors: true,
          actorsList,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_WORLD_ACTORS] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to retrieve world actors: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};
