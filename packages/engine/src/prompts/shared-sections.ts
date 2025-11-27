/**
 * Shared Prompt Sections
 *
 * Common text blocks used across multiple prompt templates.
 * Centralizes repeated content for consistency and maintainability.
 */

/**
 * Standard rules for all feed posts.
 * Enforces parody name usage and formatting guidelines.
 */
export const IMPORTANT_RULES = `IMPORTANT RULES:
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real-world person or organization names
- ALWAYS use ONLY the parody names from World Actors list (e.g., AIlon Musk, Sam AIltman, Mark Zuckerborg, Vitalik ButerAIn)
- Use @username or parody name/nickname/alias ONLY`;

/**
 * Standard content requirements for posts.
 * Ensures posts reference specific world entities.
 */
export const CONTENT_REQUIREMENTS = `CONTENT REQUIREMENTS:
- MUST reference specific actors, companies, or events from WORLD CONTEXT
- MUST mention specific actors by name (e.g., "AIlon Musk", "@ailonmusk") or companies (e.g., "TeslAI", "OpenAGI")
- MUST reference specific markets/predictions by their exact names when relevant
- MUST reference specific trades or market movements when relevant
- Use @username format when mentioning users (e.g., "@ailonmusk said...")
- Avoid generic statements - be SPECIFIC about who/what/when
- Reference current markets, predictions, or recent trades naturally`;

/**
 * Standard world context block header.
 */
export const WORLD_CONTEXT_HEADER = `WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}`;

/**
 * Standard value ranges documentation for post metadata.
 */
export const VALUE_RANGES = `VALUE RANGES:
- sentiment: -1 (very negative) to 1 (very positive)
- clueStrength: 0 (no info) to 1 (smoking gun)
- pointsToward: true (suggests positive outcome) | false (suggests negative) | null (unclear)`;

/**
 * Combined rules section for standard feed posts.
 */
export const STANDARD_FEED_RULES = `${IMPORTANT_RULES}

${CONTENT_REQUIREMENTS}`;

/**
 * Helper to generate character voice guidance section.
 * Use this in prompts where actors need distinct voices.
 *
 * @param actorVariableName - The template variable containing actor info (e.g., 'actorsList')
 */
export function characterVoiceGuidance(
  actorVariableName = 'actorsList'
): string {
  return `
CHARACTER VOICE GUIDANCE:
For each actor in {{${actorVariableName}}}, consider:
- Their unique speaking style and catchphrases
- Their personality traits and worldview
- Their relationships with other actors mentioned
- How they would authentically respond given their persona

Write in their DISTINCT VOICE - each character should sound noticeably different.`;
}

/**
 * Parody name rules for game/world prompts.
 * Simpler version focusing on name consistency.
 */
export const PARODY_NAME_RULES = `IMPORTANT RULES:
- NEVER use real-world person or organization names
- Use ONLY the exact parody names provided in the context (e.g., AIlon Musk, Sam AIltman, Mark Zuckerborg)
- NEVER "correct" or change parody names - use them exactly as shown`;

/**
 * Private vs public content guidance for group chats.
 */
export const PRIVATE_CONTENT_GUIDANCE = `PRIVATE vs PUBLIC:
- PUBLIC feed: What you want market to think
- PRIVATE chat: What you actually know/plan
- Be STRATEGIC: Help friends, hurt enemies`;

/**
 * Helper to build a complete prompt section combining common elements.
 */
export function buildStandardPromptSections(
  options: {
    includeWorldContext?: boolean;
    includeValueRanges?: boolean;
    includeVoiceGuidance?: boolean;
    actorVariableName?: string;
  } = {}
): string {
  const {
    includeWorldContext = true,
    includeValueRanges = true,
    includeVoiceGuidance = false,
    actorVariableName = 'actorsList',
  } = options;

  const sections: string[] = [];

  if (includeWorldContext) {
    sections.push(WORLD_CONTEXT_HEADER);
  }

  sections.push(STANDARD_FEED_RULES);

  if (includeVoiceGuidance) {
    sections.push(characterVoiceGuidance(actorVariableName));
  }

  if (includeValueRanges) {
    sections.push(VALUE_RANGES);
  }

  return sections.join('\n\n');
}
