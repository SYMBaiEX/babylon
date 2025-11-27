/**
 * Shared Utility Functions for Babylon Game
 *
 * Consolidated utility functions to eliminate duplication across codebase
 */

import { shuffleArray } from '@/lib/utils/randomization';
import type { Actor, ActorRelationship, Organization } from './types';

// Re-export shuffleArray from randomization utils for convenience
export { shuffleArray } from '@/lib/utils/randomization';

/**
 * Format actor voice context with postStyle and randomized postExample
 *
 * Used for LLM prompt generation to maintain actor voice consistency.
 * Randomizes post examples to add variety while preserving voice.
 *
 * @param actor - Actor with optional postStyle and postExample
 * @returns Formatted context string for LLM prompts (empty string if no voice data)
 *
 * @example
 * ```typescript
 * const context = formatActorVoiceContext({
 *   postStyle: "Concise and direct",
 *   postExample: ["Example 1", "Example 2", "Example 3"]
 * });
 * // Returns formatted string with style and 3 random examples
 * ```
 */
export function formatActorVoiceContext(actor: {
  postStyle?: string;
  postExample?: string[];
  voice?: string;
  personality?: string;
}): string {
  if (
    !actor.postStyle &&
    !actor.postExample &&
    !actor.voice &&
    !actor.personality
  ) {
    return '';
  }

  let context = '';

  // Personality drives voice - include it first
  if (actor.personality) {
    context += `\n   Personality: ${actor.personality}`;
  }

  // Voice description is the most important for distinct character sound
  if (actor.voice) {
    context += `\n   Voice: ${actor.voice}`;
  }

  if (actor.postStyle) {
    context += `\n   Writing Style: ${actor.postStyle}`;
  }

  if (actor.postExample && actor.postExample.length > 0) {
    const shuffledExamples = shuffleArray(actor.postExample);
    const examples = shuffledExamples
      .slice(0, 3)
      .map((ex) => `"${ex}"`)
      .join(', ');
    context += `\n   Example Posts: ${examples}`;
  }

  return context;
}

/**
 * Build comprehensive character voice block for LLM prompts
 *
 * Creates a detailed voice context that helps the LLM stay in character.
 * Includes identity, personality, voice description, writing style, and examples.
 *
 * @param actor - Actor with voice-related fields
 * @returns Formatted multi-line voice block for LLM prompts
 *
 * @example
 * ```typescript
 * const voiceBlock = buildCharacterVoiceBlock({
 *   name: "AIlon Musk",
 *   personality: "erratic visionary",
 *   voice: "Speaks in cryptic one-liners. Uses 'lol' unironically...",
 *   postStyle: "Short, cryptic posts. Random memes at 3am.",
 *   postExample: ["lol", "Mars by 2026. Maybe 2027."]
 * });
 * ```
 */
export function buildCharacterVoiceBlock(actor: {
  name: string;
  description?: string;
  personality?: string;
  voice?: string;
  postStyle?: string;
  postExample?: string[];
  domain?: string[];
}): string {
  const lines: string[] = [];

  lines.push(`━━━ CHARACTER VOICE: ${actor.name} ━━━`);

  // Core identity
  if (actor.description) {
    lines.push(`IDENTITY: ${actor.description}`);
  }

  // Personality archetype - drives how they sound
  if (actor.personality) {
    lines.push(`PERSONALITY: ${actor.personality}`);
  }

  // Voice description - HOW they speak
  if (actor.voice) {
    lines.push(`VOICE: ${actor.voice}`);
  }

  // Writing style - structural patterns
  if (actor.postStyle) {
    lines.push(`WRITING STYLE: ${actor.postStyle}`);
  }

  // Example posts - concrete examples to match
  if (actor.postExample && actor.postExample.length > 0) {
    const shuffled = shuffleArray(actor.postExample);
    lines.push('EXAMPLE POSTS (match this voice):');
    shuffled.slice(0, 3).forEach((ex) => {
      lines.push(`  • "${ex}"`);
    });
  }

  // Voice check instruction
  lines.push(
    `\n⚡ BEFORE WRITING: Ask yourself "How would ${actor.name} say this?" Stay in character.`
  );
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

// Note: ID generation is handled by generateSnowflakeId() from @/lib/snowflake
// This function was removed to avoid duplication

/**
 * Clamp number between min and max values
 *
 * Ensures value stays within the specified range.
 *
 * @param value - Number to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value (guaranteed to be in [min, max] range)
 * @throws Never throws - handles invalid ranges gracefully
 *
 * @example
 * ```typescript
 * clamp(150, 0, 100); // Returns: 100
 * clamp(-10, 0, 100); // Returns: 0
 * clamp(50, 0, 100);  // Returns: 50
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate sentiment score from text (simple heuristic)
 *
 * Uses keyword matching to determine sentiment. Returns value between
 * -1 (negative) and 1 (positive). Returns 0 if no sentiment keywords found.
 *
 * @param text - Text to analyze
 * @returns Sentiment score between -1 and 1 (0 for neutral/no keywords)
 *
 * @example
 * ```typescript
 * calculateSentiment("This is amazing!"); // Returns: ~0.5 (positive)
 * calculateSentiment("This is terrible"); // Returns: ~-0.5 (negative)
 * ```
 */
export function calculateSentiment(text: string): number {
  const positive =
    /\b(great|amazing|success|win|best|love|excellent|awesome)\b/gi;
  const negative =
    /\b(terrible|awful|fail|worst|hate|disaster|crisis|scandal)\b/gi;

  const positiveCount = (text.match(positive) || []).length;
  const negativeCount = (text.match(negative) || []).length;

  const total = positiveCount + negativeCount;
  if (total === 0) return 0;

  return clamp((positiveCount - negativeCount) / total, -1, 1);
}

/**
 * Format date/timestamp to readable date string
 *
 * Supports both Date objects and ISO timestamp strings.
 *
 * @param date - Date object or ISO timestamp string
 * @returns Formatted date string (e.g., "Jan 1, 2025")
 * @throws Never throws - handles invalid dates gracefully
 *
 * @example
 * ```typescript
 * formatDate(new Date()); // "Jan 16, 2025"
 * formatDate("2025-01-16T10:00:00Z"); // "Jan 16, 2025"
 * ```
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date/timestamp to readable time string
 *
 * Supports both Date objects and ISO timestamp strings.
 *
 * @param date - Date object or ISO timestamp string
 * @returns Formatted time string (e.g., "3:45 PM")
 * @throws Never throws - handles invalid dates gracefully
 *
 * @example
 * ```typescript
 * formatTime(new Date()); // "3:45 PM"
 * formatTime("2025-01-16T15:45:00Z"); // "3:45 PM"
 * ```
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Re-export randomization utilities
export {
  pickRandom,
  sampleRandom as pickRandomN,
} from '@/lib/utils/randomization';

/**
 * Build phase-specific narrative context for LLM prompts
 *
 * Provides instructions on how content should reflect the current game phase.
 * Used to guide LLM generation to match the narrative arc.
 *
 * @param day - Current game day (1-30)
 * @returns Phase-specific narrative instructions string
 *
 * @example
 * ```typescript
 * const context = buildPhaseContext(5);  // WILD phase
 * const context2 = buildPhaseContext(15); // CONNECTION phase
 * ```
 */
export function buildPhaseContext(day: number): string {
  if (day <= 10) {
    return `Phase: WILD (Days 1-10)
- Generate mysterious, disconnected events
- Drop vague hints and rumors
- Create speculation and uncertainty
- Events feel random and chaotic
- Minimal concrete information`;
  }
  if (day <= 20) {
    return `Phase: CONNECTION (Days 11-20)
- Begin connecting previous events
- Reveal relationships between actors
- Provide more concrete information
- Story threads start emerging
- Patterns become visible`;
  }
  if (day <= 25) {
    return `Phase: CONVERGENCE (Days 21-25)
- Major storyline convergence
- Big revelations about questions
- Clear narrative threads
- Dramatic developments
- Truth starts emerging`;
  }
  if (day <= 29) {
    return `Phase: CLIMAX (Days 26-29)
- Maximum drama and uncertainty
- Conflicting final clues
- Rapid developments
- High stakes moments
- Resolution seems imminent`;
  }
  return `Phase: RESOLUTION (Day 30)
- Definitive outcomes
- All questions resolved
- Epilogue content
- Narrative closure`;
}

/**
 * Build relationship context for actors in LLM prompts
 *
 * Formats actor relationships and connections for narrative generation.
 * Filters to only include relationships between the provided actors.
 *
 * @param actors - List of actors involved in the context
 * @param relationships - Relationship data between actors
 * @returns Formatted relationship context string (empty if no relevant relationships)
 *
 * @example
 * ```typescript
 * const context = buildRelationshipContext(actors, relationships);
 * // Returns: "\nKnown Relationships:\n- Actor1 & Actor2: colleague (respect)"
 * ```
 */
export function buildRelationshipContext(
  actors: Actor[],
  relationships: ActorRelationship[]
): string {
  if (!relationships || relationships.length === 0) {
    return '';
  }

  const actorIds = new Set(actors.map((a) => a.id));
  const relevantRelationships = relationships.filter(
    (r) => actorIds.has(r.actor1Id) && actorIds.has(r.actor2Id)
  );

  if (relevantRelationships.length === 0) {
    return '';
  }

  const actorMap = new Map(actors.map((a) => [a.id, a.name]));
  const relationshipLines = relevantRelationships
    .slice(0, 10)
    .map((r) => {
      const name1 = actorMap.get(r.actor1Id) || r.actor1Id;
      const name2 = actorMap.get(r.actor2Id) || r.actor2Id;
      const sentimentDesc =
        r.sentiment > 0.5 ? 'respect' : r.sentiment < -0.5 ? 'beef' : 'neutral';
      return `- ${name1} & ${name2}: ${r.relationshipType} (${sentimentDesc})${r.history ? ` - ${r.history}` : ''}`;
    })
    .join('\n');

  return `\nKnown Relationships:\n${relationshipLines}`;
}

/**
 * Convert question ID to number safely
 *
 * ⚠️  WARNING: Do NOT use with Question.id (Snowflake strings)!
 * This function is for converting Question.questionNumber or legacy numeric IDs.
 *
 * @deprecated Prefer using question.questionNumber directly
 * @param questionId - Question number (can be string or number, but NOT Snowflake ID)
 * @returns Number ID, or 0 if conversion fails
 */
export function toQuestionIdNumber(questionId: string | number): number {
  if (typeof questionId === 'number') {
    return questionId;
  }
  const parsed = Number.parseInt(String(questionId), 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Convert question ID to number or null
 *
 * ⚠️  WARNING: Do NOT use with Question.id (Snowflake strings)!
 * This function is for converting Question.questionNumber or legacy numeric IDs.
 *
 * @deprecated Prefer using question.questionNumber directly
 * @param questionId - Question number (can be string, number, null, or undefined, but NOT Snowflake ID)
 * @returns Number ID, or null if conversion fails or input is null/undefined
 */
export function toQuestionIdNumberOrNull(
  questionId: string | number | null | undefined
): number | null {
  if (questionId === null || questionId === undefined) {
    return null;
  }
  if (typeof questionId === 'number') {
    return questionId;
  }
  const parsed = Number.parseInt(String(questionId), 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Build organization behavior context for LLM prompts
 *
 * Provides guidance on how different organization types should behave
 * in narrative generation. Groups organizations by type and provides
 * type-specific behavior guidelines.
 *
 * @param organizations - List of organizations involved
 * @returns Formatted organization behavior instructions (empty if no orgs)
 *
 * @example
 * ```typescript
 * const context = buildOrganizationBehaviorContext(orgs);
 * // Returns formatted guidelines for media, company, and government orgs
 * ```
 */
export function buildOrganizationBehaviorContext(
  organizations: Organization[]
): string {
  if (!organizations || organizations.length === 0) {
    return '';
  }

  const orgsByType = {
    media: organizations.filter((o) => o.type === 'media'),
    company: organizations.filter((o) => o.type === 'company'),
    government: organizations.filter((o) => o.type === 'government'),
  };

  const contextParts: string[] = [];

  if (orgsByType.media.length > 0) {
    contextParts.push(
      `Media Organizations (${orgsByType.media.map((o) => o.name).join(', ')}):
- Break stories first, prioritize speed and exclusivity
- Cite sources when available, use "sources say" for leaks
- Maintain journalistic tone, factual but engaging
- Compete for attention and credibility`
    );
  }

  if (orgsByType.company.length > 0) {
    contextParts.push(
      `Companies (${orgsByType.company.map((o) => o.name).join(', ')}):
- Issue official statements, press releases
- Protect reputation and manage PR
- Announce developments strategically
- Respond to criticism and controversy`
    );
  }

  if (orgsByType.government.length > 0) {
    contextParts.push(
      `Government Entities (${orgsByType.government.map((o) => o.name).join(', ')}):
- Formal, official communications
- Regulatory announcements and investigations
- Policy statements and enforcement actions
- Balance transparency with discretion`
    );
  }

  return contextParts.length > 0
    ? `\nOrganization Behavior Guidelines:\n${contextParts.join('\n\n')}`
    : '';
}
