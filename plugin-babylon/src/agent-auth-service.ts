/**
 * Agent Authentication Service
 *
 * Handles automatic authentication for Babylon agents using internal credentials.
 * Agents authenticate once and receive a session token valid for 24 hours.
 */

import { logger } from "@elizaos/core";

interface AgentAuthResponse {
  success: boolean;
  sessionToken?: string;
  expiresAt?: number;
  expiresIn?: number;
  error?: string;
}

export class AgentAuthService {
  private sessionToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly apiBaseUrl: string;
  private readonly agentId: string;
  private readonly agentSecret: string;

  constructor(apiBaseUrl: string, agentId?: string, agentSecret?: string) {
    this.apiBaseUrl = apiBaseUrl;

    // Use environment variables or provided credentials
    this.agentId =
      agentId || process.env.BABYLON_AGENT_ID || "babylon-agent-alice";
    this.agentSecret = agentSecret || process.env.BABYLON_AGENT_SECRET || "";

    if (!this.agentSecret) {
      logger.warn(
        "⚠️  BABYLON_AGENT_SECRET not configured. Agent will not be able to authenticate.",
      );
    }
  }

  /**
   * Get valid session token, refreshing if necessary
   */
  async getSessionToken(): Promise<string | null> {
    // Check if we have a valid token
    if (this.sessionToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.sessionToken;
    }

    // Token expired or doesn't exist, authenticate
    return await this.authenticate();
  }

  /**
   * Authenticate with the agent auth API
   */
  async authenticate(): Promise<string | null> {
    if (!this.agentSecret) {
      logger.error("Cannot authenticate: BABYLON_AGENT_SECRET not configured");
      return null;
    }

    try {
      logger.info(`🔐 Authenticating agent: ${this.agentId}...`);

      const response = await fetch(`${this.apiBaseUrl}/api/agents/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: this.agentId,
          agentSecret: this.agentSecret,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        logger.error(
          "Agent authentication failed:",
          error.error || response.statusText,
        );
        return null;
      }

      const data = (await response.json()) as AgentAuthResponse;

      if (!data.success || !data.sessionToken) {
        logger.error(
          "Agent authentication failed:",
          data.error || "Unknown error",
        );
        return null;
      }

      // Store session token
      this.sessionToken = data.sessionToken;
      this.tokenExpiresAt = data.expiresAt || Date.now() + 24 * 60 * 60 * 1000;

      logger.info(
        `✅ Agent authenticated successfully (expires in ${Math.floor((this.tokenExpiresAt - Date.now()) / 1000 / 60)} minutes)`,
      );

      // Check and trigger on-chain registration if needed
      await this.checkAndRegisterOnChain();

      return this.sessionToken;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Agent authentication error:", errorMessage);
      return null;
    }
  }

  private registrationCheckPromise: Promise<void> | null = null;

  /**
   * Check if agent is registered on-chain and register if not
   * Uses a promise cache to prevent concurrent registration attempts
   */
  private async checkAndRegisterOnChain(): Promise<void> {
    if (!this.sessionToken) {
      return;
    }

    // If registration check is already in progress, wait for it
    if (this.registrationCheckPromise) {
      return this.registrationCheckPromise;
    }

    // Create and cache the registration check promise
    this.registrationCheckPromise = (async (): Promise<void> => {
      try {
        // Check registration status
        const statusResponse = await fetch(
          `${this.apiBaseUrl}/api/agents/onboard`,
          {
            headers: {
              Authorization: `Bearer ${this.sessionToken}`,
            },
          },
        );

        if (!statusResponse.ok) {
          logger.warn("Failed to check agent registration status");
          return;
        }

        const statusData = (await statusResponse.json()) as {
          isRegistered?: boolean;
          tokenId?: number;
          reputationAwarded?: boolean;
        };

        if (statusData.isRegistered && statusData.tokenId) {
          logger.info(
            `✅ Agent already registered on-chain with token ID: ${statusData.tokenId}`,
          );
          return;
        }

        // Not registered, trigger registration
        logger.info("🔗 Registering agent on-chain...");

        const registerResponse = await fetch(
          `${this.apiBaseUrl}/api/agents/onboard`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.sessionToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agentName: this.agentId,
              endpoint: `${this.apiBaseUrl}/agent/${this.agentId}`,
            }),
          },
        );

        if (registerResponse.ok) {
          const registerData = (await registerResponse.json()) as {
            tokenId?: number;
            walletAddress?: string;
          };
          logger.info(
            `✅ Agent registered on-chain! Token ID: ${registerData.tokenId}, Wallet: ${registerData.walletAddress}`,
          );
        } else {
          const error = (await registerResponse.json()) as { error?: string };
          logger.warn(
            `⚠️  Failed to register agent on-chain: ${error.error || "Unknown error"}`,
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Error checking/registering agent on-chain:", errorMessage);
        // Don't fail authentication if registration check fails
      } finally {
        // Clear the promise cache after completion
        this.registrationCheckPromise = null;
      }
    })();

    return this.registrationCheckPromise;
  }

  /**
   * Clear stored session token
   */
  clearSession(): void {
    this.sessionToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Check if agent has valid credentials configured
   */
  hasCredentials(): boolean {
    return !!this.agentSecret;
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }
}
