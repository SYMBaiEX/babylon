/**
 * NPC Game Context Provider
 *
 * Provides game awareness to NPCs (arc plans, phases, insider/deceiver status).
 * Converts technical arc plan data into natural language "intuitions" that guide
 * NPC behavior without exposing game mechanics.
 *
 * ONLY NPCs receive this context - user agents get nothing (they're playing the game).
 */

import {
  type DatabaseArcPlan,
  gameService,
  getArcPlan,
  getPhaseForDay,
  getSignalDirection,
  StaticDataRegistry,
  worldFactsService,
} from '@babylon/engine';
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
 * Get NPC game context directly (without ElizaOS Provider interface)
 *
 * Use this when calling from code that doesn't have Memory/State available.
 * Returns empty string for non-NPC agents.
 *
 * @param agentId - The agent's ID
 * @returns Game context string for NPCs, empty string otherwise
 */
export async function getNpcGameContext(agentId: string): Promise<string> {
  // Only NPCs get game context
  const npcActor = StaticDataRegistry.getActor(agentId);
  if (!npcActor) {
    // Not an NPC (user agent or external) - return empty
    return '';
  }

  // Get active prediction markets via service layer
  const activeMarkets = await gameService.getActiveMarketSummaries(5);

  if (activeMarkets.length === 0) {
    // No active markets - minimal context
    return `
=== YOUR INTUITIONS ===
Nothing stands out to you right now. The market feels quiet.

Remember: You are ${npcActor.name}. Post in YOUR voice, not as a reporter.
`.trim();
  }

  // Get current game day via service layer
  const currentDay = await gameService.getCurrentGameDay();

  // Build intuitions for each active market with arc plan
  const intuitions: string[] = [];

  for (const market of activeMarkets) {
    const arcPlan = (await getArcPlan(market.id)) as DatabaseArcPlan | null;
    if (!arcPlan) continue;

    const phase = getPhaseForDay(currentDay, arcPlan);

    // Note: DatabaseArcPlan doesn't include the predetermined outcome (it's on the questions table).
    // The outcome would need to be fetched separately via a join or additional query.
    // For now, default to true - this matches the pattern in event-generation-helpers.ts
    // which uses `question.outcome ?? true`. This means insiders point to YES by default.
    // TODO: Fetch actual outcome from questions table if precise signal direction is needed.
    const outcome = true;

    const signal = getSignalDirection(arcPlan, phase, agentId, outcome);

    // Convert to natural language (NEVER expose technical details)
    const topic = summarizeQuestion(market.question);
    const intuition = formatSignalAsNaturalLanguage(signal, phase, topic);

    if (intuition) {
      intuitions.push(intuition);
    }
  }

  // Get world facts for context (fail-fast: let errors propagate)
  // Use worldFacts.general (fast, no LLM call) rather than headlines (requires LLM)
  const worldFacts = await worldFactsService.generateWorldContext(false);
  const worldContext = worldFacts.general
    ? `=== WHAT'S HAPPENING ===\n${worldFacts.general}\n\n`
    : '';

  return `
${worldContext}=== YOUR INTUITIONS ===
${intuitions.length > 0 ? intuitions.join('\n') : 'Nothing stands out to you right now.'}

Remember: You are ${npcActor.name}. Post in YOUR voice, not as a reporter.
`.trim();
}

/**
 * Provider: NPC Game Context
 * Injects arc awareness and world events for NPCs only
 *
 * This wraps getNpcGameContext() for use with ElizaOS Provider interface.
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
    const text = await getNpcGameContext(agentId);
    return { text };
  },
};
