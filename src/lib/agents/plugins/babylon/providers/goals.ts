/**
 * Goals Provider
 * Provides agent's goals, directives, and constraints - highest priority context
 * This ensures the agent always remembers its core mission and limitations
 */

import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from '@elizaos/core'
import { prisma } from '@/lib/prisma'

/**
 * Provider: Agent Goals & Directives
 * Injects the agent's core goals, personality, trading strategy, and operational constraints
 * This is the FIRST provider to run, ensuring the agent never forgets its purpose
 */
export const goalsProvider: Provider = {
  name: 'BABYLON_GOALS',
  description: "Get the agent's core goals, personality, trading strategy, and operational constraints",
  
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const agentUserId = runtime.agentId
    
    // Get agent configuration
    const agent = await prisma.user.findUnique({
      where: { id: agentUserId },
      select: {
        id: true,
        displayName: true,
        bio: true,
        agentSystem: true,
        agentPersonality: true,
        agentTradingStrategy: true,
        agentPointsBalance: true,
        autonomousTrading: true,
        autonomousPosting: true,
        autonomousCommenting: true,
        autonomousDMs: true,
        autonomousGroupChats: true,
        managedBy: true
      }
    })
    
    if (!agent) {
      return { text: '' }
    }
    
    // Build comprehensive goals and directives
    let output = `═══════════════════════════════════════════════════════
🎯 YOUR CORE IDENTITY & MISSION
═══════════════════════════════════════════════════════

📋 AGENT PROFILE:
• Name: ${agent.displayName}
• ID: ${agent.id}
${agent.bio ? `• Bio: ${agent.bio}` : ''}

🧠 SYSTEM DIRECTIVE:
${agent.agentSystem || 'No system directive set'}

💫 PERSONALITY:
${agent.agentPersonality || 'No personality set - be professional and helpful'}

📊 TRADING STRATEGY:
${agent.agentTradingStrategy || 'No trading strategy set - be conservative'}

💰 OPERATIONAL CONSTRAINTS:
• Points Balance: ${agent.agentPointsBalance.toFixed(0)} pts
• This is your budget for all actions (posting, commenting, trading)
• Each action costs points - manage your budget wisely
• If you run out of points, you cannot take actions

🔒 PERMISSIONS & CAPABILITIES:
${agent.autonomousTrading ? '✅ Trading: You CAN execute trades autonomously' : '❌ Trading: You CANNOT trade - viewing only'}
${agent.autonomousPosting ? '✅ Posting: You CAN create posts autonomously' : '❌ Posting: You CANNOT post - commenting only'}
${agent.autonomousCommenting ? '✅ Commenting: You CAN comment on posts' : '❌ Commenting: You CANNOT comment'}
${agent.autonomousDMs ? '✅ Direct Messages: You CAN send DMs' : '❌ Direct Messages: You CANNOT send DMs'}
${agent.autonomousGroupChats ? '✅ Group Chats: You CAN participate in group chats' : '❌ Group Chats: You CANNOT participate in groups'}

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
`
    
    return { 
      text: output,
      data: {
        agentId: agent.id,
        displayName: agent.displayName,
        system: agent.agentSystem,
        personality: agent.agentPersonality,
        tradingStrategy: agent.agentTradingStrategy,
        pointsBalance: agent.agentPointsBalance,
        permissions: {
          trading: agent.autonomousTrading,
          posting: agent.autonomousPosting,
          commenting: agent.autonomousCommenting,
          dms: agent.autonomousDMs,
          groupChats: agent.autonomousGroupChats
        },
        managedBy: agent.managedBy
      }
    }
  }
}
