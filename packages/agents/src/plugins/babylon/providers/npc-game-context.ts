/**
 * NPC Game Context Provider
 *
 * Provides game awareness to NPCs (arc plans, phases, insider/deceiver status).
 * Converts technical arc plan data into natural language "intuitions" that guide
 * NPC behavior without exposing game mechanics.
 *
 * ONLY NPCs receive this context - user agents get nothing (they're playing the game).
 */

import { db, eq, markets } from '@babylon/db';
import {
  type DatabaseArcPlan,
  getArcPlan,
  getPhaseForDay,
  getSignalDirection,
  StaticDataRegistry,
  worldFactsService,
} from '@babylon/engine';
import { logger } from '@babylon/shared';
import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';

/**
 * Extract key topic from full question text for natural language
 * Avoids exposing full prediction market question text to NPCs
 */
function summarizeQuestion(fullText: string): string {
  // Extract actor mentions (anything with AI in the name)
  const actorPattern = /([A-Z][a-zA-Z]*AI[a-zA-Z]*)/g;
  const actors = fullText.match(actorPattern) || [];

  // Extract key topics
  const topicPatterns = [
    /robotaxi/i,
    /stock/i,
    /price/i,
    /launch/i,
    /announcement/i,
    /acquisition/i,
    /partnership/i,
    /release/i,
    /regulation/i,
    /investigation/i,
    /deal/i,
    /merger/i,
  ];

  for (const pattern of topicPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const actor = actors[0] || '';
      return `the ${actor} ${match[0].toLowerCase()} situation`.trim();
    }
  }

  // Fallback: just use first actor mention
  if (actors[0]) {
    return `the ${actors[0]} situation`;
  }

  return 'this situation';
}

/**
 * Format signal direction into natural language intuition
 * Never exposes YES/NO direction or insider status directly
 */
function formatSignalAsNaturalLanguage(
  signal: { direction: 'YES' | 'NO' | 'NEUTRAL'; reason: string },
  phase: 'early' | 'middle' | 'late' | 'climax',
  questionTopic: string
): string {
  if (signal.reason === 'insider') {
    // Insider: confident but subtle - never say "you know the answer"
    return `You have a strong gut feeling about ${questionTopic}. You're more confident than most people seem to be.`;
  }

  if (signal.reason === 'deceiver') {
    // Deceiver: convinced but will be wrong
    return `You're convinced you know how ${questionTopic} will play out. Trust your instincts on this one.`;
  }

  // Regular NPC: phase-appropriate uncertainty
  switch (phase) {
    case 'early':
      return `${questionTopic} feels uncertain. Hard to say which way it goes.`;
    case 'middle':
      return `Mixed signals on ${questionTopic}. The picture is murky.`;
    case 'late':
      return `${questionTopic} is becoming clearer. You're starting to see a pattern.`;
    case 'climax':
      return `${questionTopic} seems obvious now. You feel confident in your read.`;
    default:
      return '';
  }
}

/**
 * Get current game day from the active game
 */
async function getCurrentGameDay(): Promise<number> {
  const game = await db.game.findFirst({
    where: { isContinuous: true, isRunning: true },
    select: { currentDay: true, startedAt: true },
  });

  // Use currentDay from DB if available, otherwise calculate
  if (game?.currentDay !== undefined && game.currentDay !== null) {
    return game.currentDay;
  }

  if (!game?.startedAt) {
    return 0;
  }

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((now.getTime() - game.startedAt.getTime()) / dayMs);
}

/**
 * Provider: NPC Game Context
 * Injects arc awareness and world events for NPCs only
 */
export const npcGameContextProvider: Provider = {
  name: 'NPC_GAME_CONTEXT',
  description:
    'Provides game awareness to NPCs (arc plans, phases, intuitions)',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const agentId = runtime.agentId as string;

    // Only NPCs get game context
    const npcActor = StaticDataRegistry.getActor(agentId);
    if (!npcActor) {
      // Not an NPC (user agent or external) - return empty
      return { text: '' };
    }

    // Get active prediction markets
    const activeMarkets = await db
      .select({
        id: markets.id,
        question: markets.question,
      })
      .from(markets)
      .where(eq(markets.resolved, false))
      .limit(5);

    if (activeMarkets.length === 0) {
      // No active markets - minimal context
      return {
        text: `
=== YOUR INTUITIONS ===
Nothing stands out to you right now. The market feels quiet.

Remember: You are ${npcActor.name}. Post in YOUR voice, not as a reporter.
`.trim(),
      };
    }

    // Get current game day
    const currentDay = await getCurrentGameDay();

    // Build intuitions for each active market with arc plan
    const intuitions: string[] = [];

    for (const market of activeMarkets) {
      const arcPlan = (await getArcPlan(market.id)) as DatabaseArcPlan | null;
      if (!arcPlan) continue;

      const phase = getPhaseForDay(currentDay, arcPlan);

      // Default outcome to true for intuition generation
      const outcome = true;

      const signal = getSignalDirection(arcPlan, phase, agentId, outcome);

      // Convert to natural language (NEVER expose technical details)
      const topic = summarizeQuestion(market.question);
      const intuition = formatSignalAsNaturalLanguage(signal, phase, topic);

      if (intuition) {
        intuitions.push(intuition);
      }
    }

    // Get recent world events for context
    let worldContext = '';
    try {
      const worldFacts = await worldFactsService.generateWorldContext(false);
      if (worldFacts.headlines) {
        worldContext = `=== WHAT'S HAPPENING ===\n${worldFacts.headlines}\n\n`;
      }
    } catch (error) {
      logger.warn(
        'Failed to get world context for NPC',
        { agentId, error: String(error) },
        'NPCGameContext'
      );
    }

    return {
      text: `
${worldContext}=== YOUR INTUITIONS ===
${intuitions.length > 0 ? intuitions.join('\n') : 'Nothing stands out to you right now.'}

Remember: You are ${npcActor.name}. Post in YOUR voice, not as a reporter.
`.trim(),
    };
  },
};
