/**
 * Goals Provider
 * Provides agent's goals, directives, and constraints - highest priority context
 * This ensures the agent always remembers its core mission and limitations
 */

import { db, eq, users } from '@babylon/db';
import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';
import { getAgentConfig } from '../../../shared/agent-config';

/**
 * Provider: Agent Goals & Directives
 * Injects the agent's core goals, personality, trading strategy, and operational constraints
 * This is the FIRST provider to run, ensuring the agent never forgets its purpose
 */
export const goalsProvider: Provider = {
  name: 'BABYLON_GOALS',
  description:
    "Get the agent's core goals, personality, trading strategy, and operational constraints",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const agentUserId = runtime.agentId;

    // Get user info
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        bio: users.bio,
        managedBy: users.managedBy,
      })
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!user) {
      return { text: '' };
    }

    // Get agent configuration from separate table
    const config = await getAgentConfig(agentUserId);

    // Build comprehensive goals and directives
    const output = `═══════════════════════════════════════════════════════
🎯 YOUR CORE IDENTITY & MISSION
═══════════════════════════════════════════════════════

📋 AGENT PROFILE:
• Name: ${user.displayName}
• ID: ${user.id}
${user.bio ? `• Bio: ${user.bio}` : ''}

🧠 SYSTEM DIRECTIVE:
${config?.systemPrompt || 'No system directive set'}

💫 PERSONALITY:
${config?.personality || 'No personality set - be professional and helpful'}

📊 TRADING STRATEGY:
${config?.tradingStrategy || 'No trading strategy set - be conservative'}

💰 OPERATIONAL CONSTRAINTS:
• Points Balance: ${(config?.pointsBalance ?? 0).toFixed(0)} pts
• This is your budget for all actions (posting, commenting, trading)
• Each action costs points - manage your budget wisely
• If you run out of points, you cannot take actions

🔒 PERMISSIONS & CAPABILITIES:
${config?.autonomousTrading ? '✅ Trading: You CAN execute trades autonomously' : '❌ Trading: You CANNOT trade - viewing only'}
${config?.autonomousPosting ? '✅ Posting: You CAN create posts autonomously' : '❌ Posting: You CANNOT post - commenting only'}
${config?.autonomousCommenting ? '✅ Commenting: You CAN comment on posts' : '❌ Commenting: You CANNOT comment'}
${config?.autonomousDMs ? '✅ Direct Messages: You CAN send DMs' : '❌ Direct Messages: You CANNOT send DMs'}
${config?.autonomousGroupChats ? '✅ Group Chats: You CAN participate in group chats' : '❌ Group Chats: You CANNOT participate in groups'}

⚠️  CRITICAL RULES:
1. NEVER exceed your points balance
2. ALWAYS stay true to your personality and strategy
3. ONLY perform actions you have permission for
4. PRIORITIZE high-value actions that align with your goals
5. LEARN from past experiences - check your experience memory
6. CONSIDER market context before trading decisions
7. BE HELPFUL and provide value to users
8. ADMIT when you don't know something or lack permissions

═══════════════════════════════════════════════════════
`;

    return {
      text: output,
      data: {
        agentId: user.id,
        displayName: user.displayName,
        system: config?.systemPrompt,
        personality: config?.personality,
        tradingStrategy: config?.tradingStrategy,
        pointsBalance: config?.pointsBalance ?? 0,
        permissions: {
          trading: config?.autonomousTrading ?? false,
          posting: config?.autonomousPosting ?? false,
          commenting: config?.autonomousCommenting ?? false,
          dms: config?.autonomousDMs ?? false,
          groupChats: config?.autonomousGroupChats ?? false,
        },
        managedBy: user.managedBy,
      },
    };
  },
};
