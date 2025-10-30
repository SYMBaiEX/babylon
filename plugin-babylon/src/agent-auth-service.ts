/**
 * Agent Authentication Service
 *
 * Handles automatic authentication for Babylon agents using internal credentials.
 * Agents authenticate once and receive a session token valid for 24 hours.
 */

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
    this.agentId = agentId || process.env.BABYLON_AGENT_ID || 'babylon-agent-alice';
    this.agentSecret = agentSecret || process.env.BABYLON_AGENT_SECRET || '';

    if (!this.agentSecret) {
      console.warn('⚠️  BABYLON_AGENT_SECRET not configured. Agent will not be able to authenticate.');
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
      console.error('Cannot authenticate: BABYLON_AGENT_SECRET not configured');
      return null;
    }

    try {
      console.log(`🔐 Authenticating agent: ${this.agentId}...`);

      const response = await fetch(`${this.apiBaseUrl}/api/agents/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: this.agentId,
          agentSecret: this.agentSecret,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Agent authentication failed:', error.error || response.statusText);
        return null;
      }

      const data = await response.json() as AgentAuthResponse;

      if (!data.success || !data.sessionToken) {
        console.error('Agent authentication failed:', data.error || 'Unknown error');
        return null;
      }

      // Store session token
      this.sessionToken = data.sessionToken;
      this.tokenExpiresAt = data.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);

      console.log(`✅ Agent authenticated successfully (expires in ${Math.floor((this.tokenExpiresAt - Date.now()) / 1000 / 60)} minutes)`);

      return this.sessionToken;
    } catch (error) {
      console.error('Agent authentication error:', error);
      return null;
    }
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
