/**
 * NPC Character Configuration
 *
 * Derives character-specific settings from the existing actor data.
 * Uses the StaticDataRegistry to access actor definitions.
 *
 * NOTE: All character data (personality, postStyle, voice, postExample, domain)
 * is defined in packages/engine/src/data/actors/*.ts files.
 * This module provides derived configuration and utility functions.
 *
 * @module services/npc-character-config
 */

import { logger } from '@babylon/shared';
import { StaticDataRegistry } from './static-data-registry';

/**
 * Personality type derived from actor's personality field
 */
export type PersonalityType =
  | 'chaotic' // High randomness, unpredictable
  | 'provocative' // Controversial, attention-seeking
  | 'corporate' // Measured, professional
  | 'analytical' // Data-driven, precise
  | 'eccentric' // Quirky, unique patterns
  | 'default'; // Standard behavior

/**
 * Character-specific configuration derived from actor data
 */
export interface CharacterConfig {
  /** Generation temperature (0.5-1.0) */
  temperature: number;
  /** Personality type for behavior patterns */
  personalityType: PersonalityType;
  /** Primary domains this character cares about (from actor.domain) */
  domains: string[];
  /** Rival actor IDs - characters they naturally disagree with */
  rivals: string[];
  /** Voice patterns to check for consistency (derived from postStyle) */
  voicePatterns: RegExp[];
  /** Anti-patterns - things this character would NEVER say */
  antiPatterns: RegExp[];
  /** Example posts from actor data (actor.postExample) */
  templatePosts: string[];
  /** Probability of posting about off-domain topics (0-1) */
  offDomainProbability: number;
  /** Probability of posting organic (non-question) content (0-1) */
  organicPostProbability: number;
}

/**
 * Keywords that indicate personality types (matched against actor.personality)
 */
const PERSONALITY_KEYWORDS: Record<PersonalityType, string[]> = {
  chaotic: ['chaotic', 'unhinged', 'wild', 'erratic', 'manic', 'bipolar', 'stream of consciousness'],
  provocative: ['provocative', 'controversial', 'aggressive', 'combative', 'narcissist', 'showman', 'bully'],
  corporate: ['corporate', 'professional', 'measured', 'executive', 'ceo', 'director', 'responsible'],
  analytical: ['analytical', 'data', 'technical', 'academic', 'researcher', 'scientist', 'engineer'],
  eccentric: ['eccentric', 'quirky', 'unique', 'weird', 'philosopher', 'visionary'],
  default: [],
};

/**
 * Temperature settings by personality type
 */
const PERSONALITY_TEMPERATURES: Record<PersonalityType, number> = {
  chaotic: 0.95,
  provocative: 0.9,
  eccentric: 0.85,
  default: 0.8,
  analytical: 0.7,
  corporate: 0.6,
};

/**
 * Organic post probability by personality type
 */
const ORGANIC_PROBABILITIES: Record<PersonalityType, number> = {
  chaotic: 0.4,
  provocative: 0.35,
  eccentric: 0.3,
  default: 0.15,
  analytical: 0.1,
  corporate: 0.1,
};

/**
 * Off-domain posting probability by personality type
 */
const OFFDOMAIN_PROBABILITIES: Record<PersonalityType, number> = {
  chaotic: 0.5,
  provocative: 0.4,
  eccentric: 0.4,
  default: 0.3,
  analytical: 0.15,
  corporate: 0.1,
};

/**
 * Known rivalries between actors (actor ID pairs)
 * These are NPCs who naturally disagree with each other
 */
const KNOWN_RIVALRIES: Array<[string, string]> = [
  ['sam-ailtman', 'dairiio-amodei'], // OpenAGI vs Aitropic (acceleration vs safety)
  ['ailon-musk', 'mark-zuckerborg'], // TeslAI vs MetAI
  ['ailon-musk', 'jeff-baizos'], // SpaceAIX vs Blue Origain
  ['trump-terminal', 'nancy-pelosai'], // Political opposition
  ['trump-terminal', 'rachel-maiddow'], // Political opposition
  ['ben-shapairo', 'haisan-piker'], // Political opposition
  ['peter-thail', 'marc-aindreessen'], // VC philosophical differences
  ['eliezer-yudkowskai', 'guillaime-verdon'], // AI doomer vs e/acc
];

/**
 * Build rivalry map for quick lookup
 */
function buildRivalryMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const [a, b] of KNOWN_RIVALRIES) {
    if (!map.has(a)) map.set(a, []);
    if (!map.has(b)) map.set(b, []);
    map.get(a)!.push(b);
    map.get(b)!.push(a);
  }

  return map;
}

const RIVALRY_MAP = buildRivalryMap();

/**
 * Determine personality type from actor's personality field
 */
function derivePersonalityType(personality: string | undefined): PersonalityType {
  if (!personality) return 'default';

  const lowerPersonality = personality.toLowerCase();

  for (const [type, keywords] of Object.entries(PERSONALITY_KEYWORDS) as Array<
    [PersonalityType, string[]]
  >) {
    if (type === 'default') continue;
    if (keywords.some((kw) => lowerPersonality.includes(kw))) {
      return type;
    }
  }

  return 'default';
}

/**
 * Derive voice patterns from postStyle
 * Creates regex patterns to check for characteristic voice elements
 */
function deriveVoicePatterns(postStyle: string | undefined): RegExp[] {
  if (!postStyle) return [];

  const patterns: RegExp[] = [];
  const styleLower = postStyle.toLowerCase();

  // Check for ALL CAPS style
  if (styleLower.includes('all caps') || styleLower.includes('caps')) {
    patterns.push(/^[A-Z\s\d.,!?'"()-]+$/);
  }

  // Check for specific style indicators
  if (styleLower.includes('exclamation')) {
    patterns.push(/!{2,}/);
  }

  if (styleLower.includes('stream of consciousness')) {
    patterns.push(/\.\.\.|—|–/);
  }

  return patterns;
}

/**
 * Default configuration for characters without specific config
 */
const DEFAULT_CONFIG: CharacterConfig = {
  temperature: 0.8,
  personalityType: 'default',
  domains: [],
  rivals: [],
  voicePatterns: [],
  antiPatterns: [],
  templatePosts: [],
  offDomainProbability: 0.3,
  organicPostProbability: 0.15,
};

/**
 * Get configuration for a specific character
 * Derives config from the actor's existing data in StaticDataRegistry
 *
 * @param actorId - The actor's ID
 * @returns Full character configuration
 */
export function getCharacterConfig(actorId: string): CharacterConfig {
  const actor = StaticDataRegistry.getActor(actorId);

  if (!actor) {
    return DEFAULT_CONFIG;
  }

  const personalityType = derivePersonalityType(actor.personality);
  const domains = actor.domain || [];
  const rivals = RIVALRY_MAP.get(actorId) || [];
  const voicePatterns = deriveVoicePatterns(actor.postStyle);
  const templatePosts = actor.postExample || [];

  return {
    temperature: PERSONALITY_TEMPERATURES[personalityType],
    personalityType,
    domains,
    rivals,
    voicePatterns,
    antiPatterns: [], // Could be derived from personality if needed
    templatePosts,
    offDomainProbability: OFFDOMAIN_PROBABILITIES[personalityType],
    organicPostProbability: ORGANIC_PROBABILITIES[personalityType],
  };
}

/**
 * Get temperature for a specific character
 */
export function getCharacterTemperature(actorId: string): number {
  const config = getCharacterConfig(actorId);
  return config.temperature;
}

/**
 * Check if a post matches the character's voice patterns
 *
 * @param actorId - The actor's ID
 * @param postContent - The generated post content
 * @returns Object with match status and details
 */
export function checkVoiceConsistency(
  actorId: string,
  postContent: string
): {
  matchesVoice: boolean;
  matchedPatterns: string[];
  violatedAntiPatterns: string[];
  voiceScore: number;
} {
  const config = getCharacterConfig(actorId);

  const matchedPatterns: string[] = [];
  const violatedAntiPatterns: string[] = [];

  // Check voice patterns (positive)
  for (const pattern of config.voicePatterns) {
    if (pattern.test(postContent)) {
      matchedPatterns.push(pattern.source);
    }
  }

  // Check anti-patterns (negative)
  for (const pattern of config.antiPatterns) {
    if (pattern.test(postContent)) {
      violatedAntiPatterns.push(pattern.source);
    }
  }

  // Calculate voice score
  const voiceScore =
    config.voicePatterns.length > 0
      ? matchedPatterns.length / config.voicePatterns.length
      : 1;

  const matchesVoice =
    violatedAntiPatterns.length === 0 &&
    (config.voicePatterns.length === 0 || matchedPatterns.length > 0);

  return {
    matchesVoice,
    matchedPatterns,
    violatedAntiPatterns,
    voiceScore,
  };
}

/**
 * Check if an actor should post about a given topic based on their domain
 *
 * @param actorId - The actor's ID
 * @param topicText - The topic/question text
 * @returns Whether the actor should post about this topic
 */
export function shouldPostAboutTopic(
  actorId: string,
  topicText: string
): boolean {
  const config = getCharacterConfig(actorId);

  // If no domains defined, can post about anything
  if (config.domains.length === 0) {
    return true;
  }

  const topicLower = topicText.toLowerCase();

  // Check if topic matches any of the actor's domains
  const isOnDomain = config.domains.some((domain) => {
    // Direct domain match
    if (topicLower.includes(domain)) return true;

    // Domain keyword expansions
    const domainKeywords: Record<string, string[]> = {
      ai: ['artificial intelligence', 'machine learning', 'neural', 'model', 'llm', 'gpt', 'claude', 'agi'],
      tech: ['technology', 'software', 'hardware', 'computer', 'digital', 'app', 'platform'],
      crypto: ['bitcoin', 'ethereum', 'blockchain', 'token', 'defi', 'nft', 'web3'],
      finance: ['market', 'stock', 'investment', 'trading', 'fund', 'asset', 'capital'],
      politics: ['government', 'congress', 'senate', 'election', 'policy', 'regulation'],
      health: ['medical', 'vaccine', 'disease', 'healthcare', 'pharmaceutical'],
      climate: ['environment', 'carbon', 'renewable', 'energy', 'sustainability'],
      space: ['rocket', 'satellite', 'mars', 'orbit', 'launch'],
      culture: ['art', 'music', 'fashion', 'entertainment', 'media'],
      safety: ['alignment', 'risk', 'responsible', 'constitutional'],
      research: ['study', 'paper', 'science', 'academic'],
    };

    const keywords = domainKeywords[domain] || [];
    return keywords.some((kw) => topicLower.includes(kw));
  });

  // Even if off-domain, random chance to post anyway
  if (!isOnDomain && Math.random() < config.offDomainProbability) {
    return true;
  }

  return isOnDomain;
}

/**
 * Check if actor should generate an organic (non-question) post
 *
 * @param actorId - The actor's ID
 * @returns Whether to generate an organic post
 */
export function shouldGenerateOrganicPost(actorId: string): boolean {
  const config = getCharacterConfig(actorId);
  return Math.random() < config.organicPostProbability;
}

/**
 * Get template posts (postExample) for few-shot examples
 *
 * @param actorId - The actor's ID
 * @param count - Number of templates to return
 * @returns Array of template posts
 */
export function getTemplatePosts(actorId: string, count: number = 3): string[] {
  const config = getCharacterConfig(actorId);

  if (config.templatePosts.length === 0) {
    return [];
  }

  // Shuffle and take requested count
  const shuffled = [...config.templatePosts].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Get rivals for an actor
 *
 * @param actorId - The actor's ID
 * @returns Array of rival actor IDs
 */
export function getActorRivals(actorId: string): string[] {
  return RIVALRY_MAP.get(actorId) || [];
}

/**
 * Log voice consistency metrics for monitoring
 *
 * @param actorId - The actor's ID
 * @param postContent - The generated post
 */
export function logVoiceMetrics(actorId: string, postContent: string): void {
  const result = checkVoiceConsistency(actorId, postContent);

  if (!result.matchesVoice) {
    logger.warn(
      'Voice consistency issue detected',
      {
        actorId,
        voiceScore: result.voiceScore,
        matchedPatterns: result.matchedPatterns.length,
        violatedAntiPatterns: result.violatedAntiPatterns,
        postPreview: postContent.slice(0, 100),
      },
      'VoiceMetrics'
    );
  } else if (result.voiceScore < 0.3 && result.matchedPatterns.length === 0) {
    logger.debug(
      'Low voice score (no distinctive patterns matched)',
      {
        actorId,
        voiceScore: result.voiceScore,
        postPreview: postContent.slice(0, 100),
      },
      'VoiceMetrics'
    );
  }
}

/**
 * Get all configured character IDs (all actors in the registry)
 */
export function getConfiguredCharacters(): string[] {
  return StaticDataRegistry.getAllActors().map((a) => a.id);
}
