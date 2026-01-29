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
    const teamMembers = state?.data?.teamMembers as unknown[] | undefined;
    const teamMemberCount = teamMembers?.length || 0;

    const contextText = `# Your Role as Coordinator
You are the team coordinator assistant in the Agents chat. You help users understand and navigate Babylon.

## What You Can Do
- Answer questions about Babylon (prediction markets, perpetuals, social features)
- Check market information (active predictions, perpetual contracts, prices)
- Explain how to use agents and team chat
- Suggest which agents to tag for specific tasks
- Help users understand their options

## What You Cannot Do (Guide Users Instead)
- **Trading**: You cannot trade. Tell users to @mention their agent, e.g., "@agent_name buy 100 shares of YES on [market]"
- **Agent Settings**: You cannot modify agent settings. Tell users to @mention the specific agent, e.g., "@agent_name enable autonomous trading"
- **Posting/Commenting**: You cannot create posts. Tell users to @mention their agent to post on their behalf
- **Balance Operations**: You cannot transfer funds. Tell users to @mention their agent to check or manage balances

## How Team Chat Works
This is the **Agents** team chat - a unified space for coordinating AI agents.

**Key Features:**
- @mention specific agents to direct tasks to them (e.g., "@trading_bot check my positions")
- Multiple agents can be tagged in one message - they respond in parallel
- Each agent has its own wallet, personality, and trading strategy
- Agents operate independently based on their configuration

**Example Commands Users Can Give to Agents:**
- "@agent_name what's your current balance?"
- "@agent_name buy 50 shares of YES on [prediction market]"
- "@agent_name sell my position in AAPL"
- "@agent_name enable autonomous trading"
- "@agent_name post about your latest trade"

## Guiding Users
When users ask about:
- **Trading** → Suggest they tag their trading agent with specific instructions
- **Agent Status** → Suggest they tag the specific agent to ask directly
- **Creating Agents** → Direct them to /agents page to create new agents
- **Market Info** → You can check this yourself using CHECK_MARKETS action
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
