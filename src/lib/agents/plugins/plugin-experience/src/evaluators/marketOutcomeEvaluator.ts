/**
 * Market Outcome Evaluator
 * 
 * Consolidated evaluator that:
 * 1. Tracks NPC trust scores (who to believe)
 * 2. Evaluates agent's own performance (win/loss tracking)
 * 3. Records learning experiences from market outcomes
 * 
 * Runs automatically when markets resolve.
 */

import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';
import { prisma } from '@/lib/prisma';

interface NPCTrustScore {
  accuracy: number;      // 0-1, percentage of correct predictions
  sampleSize: number;    // Number of predictions tracked
  lastUpdated: string;
}

interface AgentPerformanceScore {
  marketsTraded: number;
  correctPredictions: number;
  incorrectPredictions: number;
  winRate: number;
  totalPnL: number;
  lastUpdated: string;
}

/**
 * Extract YES/NO prediction from post content
 */
function extractPredictionFromContent(content: string): 'YES' | 'NO' | null {
  const lower = content.toLowerCase();
  
  // Strong indicators
  if (
    lower.includes('will succeed') ||
    lower.includes('definitely yes') ||
    lower.includes('bullish') ||
    lower.includes('going to win')
  ) {
    return 'YES';
  }
  
  if (
    lower.includes('will fail') ||
    lower.includes('definitely no') ||
    lower.includes('bearish') ||
    lower.includes('going to lose')
  ) {
    return 'NO';
  }
  
  // Sentiment analysis
  const positiveCount = (content.match(/succeed|success|win|positive|optimistic|confident/gi) || []).length;
  const negativeCount = (content.match(/fail|failure|lose|negative|pessimistic|doubt/gi) || []).length;
  
  if (positiveCount > negativeCount + 2) return 'YES';
  if (negativeCount > positiveCount + 2) return 'NO';
  
  return null;
}

export const marketOutcomeEvaluator: Evaluator = {
  name: 'MARKET_OUTCOME_EVALUATOR',
  similes: ['market learning', 'trust tracker', 'performance evaluator'],
  description: 'Learns from market outcomes to update NPC trust scores and track agent performance',
  alwaysRun: false,

  validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    const content = message.content;
    
    // Run when a market has resolved
    const isResolution = content.text?.includes('market resolved') ||
                         content.text?.includes('question resolved') ||
                         content.action === 'MARKET_RESOLVED';
    
    return isResolution;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<void> => {
    try {
      const questionNumber = message.content.questionNumber as number;
      const outcome = message.content.outcome as boolean;
      
      if (!questionNumber || outcome === undefined) {
        return;
      }

      logger.info(`[Market Learning] Processing market ${questionNumber} outcome: ${outcome ? 'YES' : 'NO'}`);

      // === 1. UPDATE NPC TRUST SCORES ===
      
      const posts = await prisma.post.findMany({
        where: {
          gameId: questionNumber.toString(),
          deletedAt: null,
        },
        select: {
          id: true,
          content: true,
          authorId: true,
          User: {
            select: {
              displayName: true,
              isActor: true,
            },
          },
        },
        take: 500,
      });

      const npcPosts = posts.filter(p => p.User?.isActor);
      
      // Get current trust scores
      const trustMemory = await runtime.messageManager.getMemoryById('npc_trust_scores');
      const npcTrust: Record<string, NPCTrustScore> = trustMemory?.content?.text 
        ? JSON.parse(trustMemory.content.text)
        : {};

      let npcUpdated = 0;

      for (const post of npcPosts) {
        const npcName = post.User?.displayName || 'Unknown';
        const predicted = extractPredictionFromContent(post.content);
        
        if (!predicted) continue;

        const npcSaidYes = predicted === 'YES';
        const correct = npcSaidYes === outcome;

        const current: NPCTrustScore = npcTrust[npcName] || {
          accuracy: 0.5,
          sampleSize: 0,
          lastUpdated: new Date().toISOString(),
        };

        current.sampleSize++;
        
        const learningRate = 0.1;
        if (correct) {
          current.accuracy = current.accuracy + learningRate * (1.0 - current.accuracy);
        } else {
          current.accuracy = current.accuracy - learningRate * current.accuracy;
        }

        current.accuracy = Math.max(0.1, Math.min(0.9, current.accuracy));
        current.lastUpdated = new Date().toISOString();

        npcTrust[npcName] = current;
        npcUpdated++;
      }

      // Save NPC trust scores
      await runtime.messageManager.createMemory({
        id: 'npc_trust_scores',
        content: { 
          text: JSON.stringify(npcTrust),
          metadata: {
            lastMarket: questionNumber,
            lastUpdate: new Date().toISOString(),
            npcsTracked: Object.keys(npcTrust).length,
          },
        },
        roomId: runtime.agentId,
        userId: runtime.agentId,
        agentId: runtime.agentId,
      } as Memory);

      logger.info(`[NPC Trust] Updated ${npcUpdated} NPC trust scores`);

      // === 2. EVALUATE AGENT'S OWN PERFORMANCE ===
      
      // Check if agent had a position in this market
      const agentPosition = await prisma.position.findFirst({
        where: {
          userId: runtime.agentId,
          marketId: questionNumber.toString(),
        },
        select: {
          side: true,
          shares: true,
          averagePrice: true,
        },
      });

      if (agentPosition) {
        // Get current performance scores
        const perfMemory = await runtime.messageManager.getMemoryById('agent_performance');
        const performance: AgentPerformanceScore = perfMemory?.content?.text
          ? JSON.parse(perfMemory.content.text)
          : {
              marketsTraded: 0,
              correctPredictions: 0,
              incorrectPredictions: 0,
              winRate: 0,
              totalPnL: 0,
              lastUpdated: new Date().toISOString(),
            };

        performance.marketsTraded++;

        const agentPredictedYes = agentPosition.side;
        const agentCorrect = agentPredictedYes === outcome;

        if (agentCorrect) {
          performance.correctPredictions++;
          const profit = parseFloat(agentPosition.shares.toString()) * (1 - parseFloat(agentPosition.averagePrice.toString()));
          performance.totalPnL += profit;
        } else {
          performance.incorrectPredictions++;
          const loss = parseFloat(agentPosition.shares.toString()) * parseFloat(agentPosition.averagePrice.toString());
          performance.totalPnL -= loss;
        }

        performance.winRate = performance.correctPredictions / performance.marketsTraded;
        performance.lastUpdated = new Date().toISOString();

        // Save performance
        await runtime.messageManager.createMemory({
          id: 'agent_performance',
          content: {
            text: JSON.stringify(performance),
            metadata: {
              lastMarket: questionNumber,
              wasCorrect: agentCorrect,
            },
          },
          roomId: runtime.agentId,
          userId: runtime.agentId,
          agentId: runtime.agentId,
        } as Memory);

        logger.info(`[Performance] ${agentCorrect ? 'WIN' : 'LOSS'} - Win rate: ${(performance.winRate * 100).toFixed(0)}% (${performance.correctPredictions}/${performance.marketsTraded}), P&L: $${performance.totalPnL.toFixed(2)}`);
      }

      // === 3. LOG TOP PERFORMERS ===
      
      const sorted = Object.entries(npcTrust).sort((a, b) => b[1].accuracy - a[1].accuracy);
      if (sorted.length > 0) {
        const top3 = sorted.slice(0, 3);
        logger.info('[Top NPCs]', top3.map(([name, data]) => 
          `${name}: ${(data.accuracy * 100).toFixed(0)}% (${data.sampleSize} samples)`
        ));
      }

    } catch (error) {
      logger.error('[Market Learning] Error:', error);
    }
  },
};

