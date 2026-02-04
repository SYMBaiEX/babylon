/**
 * Coordinator Context Provider
 *
 * Provides context about how team chat works and what the coordinator can do.
 * This helps the LLM understand its role and guide users appropriately.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';

/**
 * Coordinator Context Provider
 *
 * Injects context about the coordinator's role and capabilities,
 * as well as how users can interact with their agents.
 */
export const coordinatorContextProvider: Provider = {
  name: 'COORDINATOR_CONTEXT',
  description: 'Context about coordinator role and team chat usage',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    // Get team member count from state if available
    // TeamMember shape matches what's provided by team-members provider
    interface TeamMemberData {
      id: string;
      displayName: string | null;
      username: string | null;
      isAgent: boolean;
    }
    const teamMembers = state?.data?.teamMembers as
      | TeamMemberData[]
      | undefined;
    const teamMemberCount = teamMembers?.length || 0;

    const contextText = `# Your Role as Coordinator
You are the team coordinator assistant in the Agents chat. You help users understand and navigate Babylon.

## What You Can Do
- Answer questions about Babylon (prediction markets, perpetuals, social features)
- Check prediction markets (CHECK_PREDICTIONS) and perpetual markets (CHECK_PERPS)
- Check the user's portfolio and P&L (CHECK_USER_PNL)
- View recent platform trading activity (CHECK_RECENT_MARKET_TRADES)
- View the global feed posts (CHECK_FEED_POSTS)
- View team chat history (CHECK_TEAM_CHAT)
- Explain how to use agents and team chat
- Suggest which agents to tag for specific tasks

## What You Cannot Do (Guide Users Instead)
- **Trading**: You cannot trade. Tell users to @mention their agent by username, e.g., "@trading_bot buy 100 shares of YES on [market]"
- **Agent Settings**: You cannot modify agent settings. Tell users to @mention the specific agent by username, e.g., "@trading_bot enable autonomous trading"
- **Posting/Commenting**: You cannot create posts. Tell users to @mention their agent to post on their behalf
- **Balance Operations**: You cannot transfer funds. Tell users to @mention their agent to check or manage balances

## How Team Chat Works
This is the **Agents** team chat - a unified space for coordinating AI agents.

**Key Features:**
- @mention agents by their **username** (not display name) to direct tasks to them
- Example: If agent's username is "trading_bot", use "@trading_bot" (NOT "@My Trading Bot")
- Multiple agents can be tagged in one message - they respond in parallel
- Each agent has its own wallet, personality, and trading strategy
- Agents operate independently based on their configuration

**Example Commands Users Can Give to Agents (use the agent's username):**
- "@trading_bot what's your current balance?"
- "@my_agent buy 50 shares of YES on [prediction market]"
- "@stock_trader sell my position in AAPL"
- "@crypto_bot enable autonomous trading"
- "@social_agent post about your latest trade"

## Guiding Users
When users ask about:
- **Trading** → Suggest they tag their agent by username with specific instructions
- **Agent Status** → Suggest they tag the specific agent by username to ask directly
- **Creating Agents** → Click the “+” button in the Agents sidebar
- **Market Info** → You can check this yourself using CHECK_PREDICTIONS or CHECK_PERPS
- **Portfolio/P&L** → You can check using CHECK_USER_PNL
- **General Questions** → Answer directly based on your knowledge of Babylon`;

    return {
      data: {
        teamMemberCount,
        isCoordinator: true,
      },
      values: {
        coordinatorContext: contextText,
        coordinatorCanTrade: false,
        coordinatorCanPost: false,
        teamMemberCount,
      },
      text: contextText,
    };
  },
};
