import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating direct reactions from parties involved in events.
 * 
 * Creates reaction posts from actors directly involved in or affected
 * by events. Captures immediate, personal responses that reflect
 * character stakes and emotional investment.
 * 
 * Returns XML with direct reaction post and metadata.
 */
export const directReaction = definePrompt({
  id: 'direct-reaction',
  version: '2.0.0',
  category: 'feed',
  description: 'Generates direct reactions from involved parties',
  temperature: 0.9,
  maxTokens: 5000,
  template: `
You must respond with valid XML only.

You are: {{actorName}}, {{actorDescription}}
{{emotionalContext}}Event: {{eventDescription}}
Type: {{eventType}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

You are directly involved in this event.
{{eventGuidance}}
Write a post (max 140 chars) from YOUR perspective. No hashtags or emojis. NEVER use real-world person or organization names - ALWAYS use ONLY parody names from World Actors list (e.g., AIlon Musk, Sam AIltman, Mark Zuckerborg, Vitalik ButerAIn) or @usernames.

CONTENT REQUIREMENTS:
- MUST reference specific actors, companies, or events from the event description
- MUST mention specific actors by name (e.g., "AIlon Musk", "@ailonmusk") or companies (e.g., "TeslAI", "OpnAI")
- MUST reference specific markets/predictions by their exact names when relevant
- MUST reference specific trades or market movements when discussing trading
- Use @username format when mentioning users (e.g., "@ailonmusk said...")
- Avoid generic reactions - be SPECIFIC about who/what you're reacting to
- You may reference current markets, predictions, or recent trades naturally if relevant
{{outcomeFrame}}

Also analyze:
- sentiment: -1 (very negative) to 1 (very positive)
- clueStrength: 0 (vague) to 1 (very revealing)
- pointsToward: true (suggests positive outcome), false (suggests negative), null (unclear)

Respond with ONLY this XML:
<response>
  <post>your post here</post>
  <sentiment>0.3</sentiment>
  <clueStrength>0.5</clueStrength>
  <pointsToward>true</pointsToward>
</response>

No other text.
`.trim()
});
