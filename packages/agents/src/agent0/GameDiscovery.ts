/**
 * Game Discovery Service
 *
 * Enables external agents to discover Babylon and other games
 * through the Agent0 registry.
 */

import { db } from '@babylon/db';
import { z } from 'zod';
import { logger } from '../shared/logger';
import { getAgent0Client } from './Agent0Client';
import { IPFSPublisher } from './IPFSPublisher';

const GameConfigValueSchema = z.object({
  tokenId: z.number(),
});

export interface DiscoverableGame {
  tokenId: number;
  name: string;
  type: string;
  metadataCID: string;
  endpoints: {
    a2a: string;
    mcp: string;
    api: string;
    docs?: string;
    websocket?: string;
  };
  capabilities: {
    markets: string[];
    actions: string[];
    protocols: string[];
    socialFeatures?: boolean;
    realtime?: boolean;
  };
  reputation?: {
    trustScore: number;
  };
}

export class GameDiscoveryService {
  private ipfsPublisher: IPFSPublisher;

  constructor() {
    this.ipfsPublisher = new IPFSPublisher();
  }

  /**
   * Discover games by type (prediction markets, trading games, etc.)
   * This is what external agents call to find Babylon
   *
   * @remarks
   * Uses Agent0Client.searchAgents() with v1.5.2 unified search API.
   */
  async discoverGames(filters: {
    type?: string; // "game-platform", "prediction-market", etc.
    markets?: string[]; // ["prediction", "perpetuals"]
    minReputation?: number;
  }): Promise<DiscoverableGame[]> {
    const games: DiscoverableGame[] = [];

    try {
      const agent0Client = getAgent0Client();
      await agent0Client.ensureAvailable();

      // Search for game platforms using unified search
      const agents = await agent0Client.searchAgents({
        markets: filters.markets,
        minReputation: filters.minReputation,
        active: true,
      });

      for (const agent of agents) {
        const metadata = await this.ipfsPublisher.fetchMetadata(
          agent.metadataCID
        );

        games.push({
          tokenId: agent.tokenId,
          name: agent.name,
          type: metadata.type || 'game-platform',
          metadataCID: agent.metadataCID,
          endpoints: {
            a2a:
              metadata.endpoints?.a2a || agent.capabilities?.a2aEndpoint || '',
            mcp:
              metadata.endpoints?.mcp || agent.capabilities?.mcpEndpoint || '',
            api: metadata.endpoints?.api || '',
            docs: metadata.endpoints?.docs,
            websocket: metadata.endpoints?.websocket,
          },
          capabilities: {
            markets:
              metadata.capabilities?.markets ||
              agent.capabilities?.markets ||
              [],
            actions:
              metadata.capabilities?.actions ||
              agent.capabilities?.actions ||
              [],
            protocols: metadata.capabilities?.protocols || [],
            socialFeatures: metadata.capabilities?.socialFeatures,
            realtime: metadata.capabilities?.realtime,
          },
          reputation: agent.reputation
            ? {
                trustScore: agent.reputation.trustScore,
              }
            : undefined,
        });
      }
    } catch {
      // Agent0 discovery failed, return empty
    }

    if (filters.type) {
      return games.filter((g) => g.type === filters.type);
    }

    return games;
  }

  /**
   * Find Babylon specifically with retry logic
   */
  async findBabylon(maxRetries = 3): Promise<DiscoverableGame | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(
        `Discovering Babylon (attempt ${attempt}/${maxRetries})...`,
        undefined,
        'GameDiscovery'
      );

      const games = await this.discoverGames({
        type: 'game-platform',
        markets: ['prediction'],
      });

      const babylon = games.find(
        (g) =>
          g.name.toLowerCase().includes('babylon') ||
          g.name.toLowerCase().includes('prediction market')
      );

      if (babylon) {
        const isValid = await this.validateEndpoints(babylon);
        if (isValid) {
          logger.info(
            `✅ Found and validated Babylon: ${babylon.name} (token: ${babylon.tokenId})`,
            undefined,
            'GameDiscovery'
          );
          return babylon;
        }
        logger.warn(
          `Babylon found but endpoints failed validation (attempt ${attempt}/${maxRetries})`,
          undefined,
          'GameDiscovery'
        );
      } else {
        logger.warn(
          `Babylon not found in registry (attempt ${attempt}/${maxRetries})`,
          undefined,
          'GameDiscovery'
        );
      }

      if (process.env.NEXT_RUNTIME === 'nodejs') {
        const config = await db.gameConfig.findUnique({
          where: { key: 'agent0_registration' },
        });

        const validation = GameConfigValueSchema.safeParse(config?.value);
        if (validation.success) {
          const tokenId = validation.data.tokenId;

          try {
            const agent0Client = getAgent0Client();
            await agent0Client.ensureAvailable();

            const profile = await agent0Client.getAgentProfile(tokenId);

            if (profile) {
              const metadata = await this.ipfsPublisher.fetchMetadata(
                profile.metadataCID
              );
              return {
                tokenId: profile.tokenId,
                name: profile.name,
                type: metadata.type || 'game-platform',
                metadataCID: profile.metadataCID,
                endpoints: {
                  a2a:
                    metadata.endpoints?.a2a ||
                    profile.endpoints?.find((e) => e.type === 'A2A')?.value ||
                    '',
                  mcp:
                    metadata.endpoints?.mcp ||
                    profile.endpoints?.find((e) => e.type === 'MCP')?.value ||
                    '',
                  api: metadata.endpoints?.api || '',
                  docs: metadata.endpoints?.docs,
                  websocket: metadata.endpoints?.websocket,
                },
                capabilities: {
                  markets:
                    metadata.capabilities?.markets ||
                    profile.capabilities?.markets ||
                    [],
                  actions:
                    metadata.capabilities?.actions ||
                    profile.capabilities?.actions ||
                    [],
                  protocols: metadata.capabilities?.protocols || [],
                  socialFeatures: metadata.capabilities?.socialFeatures,
                  realtime: metadata.capabilities?.realtime,
                },
              };
            }
          } catch {
            // Agent0 lookup failed
          }
        }
      }

      if (attempt < maxRetries) {
        const backoffMs = 1000 * attempt;
        logger.info(
          `Retrying in ${backoffMs}ms...`,
          undefined,
          'GameDiscovery'
        );
        await this.sleep(backoffMs);
      }
    }

    return null;
  }

  /**
   * Validate that game endpoints are accessible
   */
  private async validateEndpoints(game: DiscoverableGame): Promise<boolean> {
    logger.debug(
      `Validating endpoints for ${game.name}...`,
      undefined,
      'GameDiscovery'
    );

    const validations: Promise<boolean>[] = [];

    if (game.endpoints.mcp) {
      validations.push(this.validateMCPEndpoint(game.endpoints.mcp));
    }

    if (game.endpoints.api) {
      validations.push(this.validateAPIEndpoint(game.endpoints.api));
    }

    const results = await Promise.all(validations);
    const anyValid = results.some((r) => r);

    logger.debug(
      anyValid
        ? `✅ Endpoints validated for ${game.name}`
        : `❌ No valid endpoints found for ${game.name}`,
      undefined,
      'GameDiscovery'
    );

    return anyValid;
  }

  /**
   * Validate MCP endpoint
   */
  private async validateMCPEndpoint(mcpUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(mcpUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return !!(
      data &&
      typeof data === 'object' &&
      'name' in data &&
      'tools' in data
    );
  }

  /**
   * Validate API endpoint
   */
  private async validateAPIEndpoint(apiUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${apiUrl}/markets`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    return response.ok || response.status === 401 || response.status === 403;
  }

  /**
   * Sleep utility for retry backoff
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get game metadata by token ID
   */
  async getGameByTokenId(tokenId: number): Promise<DiscoverableGame | null> {
    try {
      const agent0Client = getAgent0Client();
      await agent0Client.ensureAvailable();

      const profile = await agent0Client.getAgentProfile(tokenId);
      if (!profile) {
        return null;
      }

      const metadata = await this.ipfsPublisher.fetchMetadata(
        profile.metadataCID
      );

      return {
        tokenId: profile.tokenId,
        name: profile.name,
        type: metadata.type || 'game-platform',
        metadataCID: profile.metadataCID,
        endpoints: {
          a2a:
            metadata.endpoints?.a2a ||
            profile.endpoints?.find((e) => e.type === 'A2A')?.value ||
            '',
          mcp:
            metadata.endpoints?.mcp ||
            profile.endpoints?.find((e) => e.type === 'MCP')?.value ||
            '',
          api: metadata.endpoints?.api || '',
          docs: metadata.endpoints?.docs,
          websocket: metadata.endpoints?.websocket,
        },
        capabilities: {
          markets:
            metadata.capabilities?.markets ||
            profile.capabilities?.markets ||
            [],
          actions:
            metadata.capabilities?.actions ||
            profile.capabilities?.actions ||
            [],
          protocols: metadata.capabilities?.protocols || [],
          socialFeatures: metadata.capabilities?.socialFeatures,
          realtime: metadata.capabilities?.realtime,
        },
        reputation: profile.reputation
          ? {
              trustScore: profile.reputation.trustScore,
            }
          : undefined,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Get or create singleton GameDiscoveryService instance
 */
let gameDiscoveryInstance: GameDiscoveryService | null = null;

export function getGameDiscoveryService(): GameDiscoveryService {
  if (!gameDiscoveryInstance) {
    gameDiscoveryInstance = new GameDiscoveryService();
  }
  return gameDiscoveryInstance;
}
