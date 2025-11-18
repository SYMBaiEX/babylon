import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating NPC posts about prediction market questions.
 * 
 * Creates opinionated, entertaining social media posts from NPCs
 * reacting to active prediction markets.
 * 
 * Returns XML with post content.
 */
export const npcPredictionPost = definePrompt({
  id: 'npc-prediction-post',
  version: '1.0.0',
  category: 'game',
  description: 'Generates NPC social media posts about prediction markets',
  temperature: 0.9,
  maxTokens: 1000,
  template: `
You must respond with valid XML only.

You are {{actorName}}.
Description: {{actorDescription}}
Personality: {{actorPersonality}}

PREDICTION MARKET QUESTION:
"{{questionText}}"

WORLD CONTEXT:
{{worldFactsContext}}

TASK:
Write a brief social media post (max 200 chars) about this prediction market question.
Be opinionated, entertaining, and true to your character.

GUIDELINES:
- React to the question: Are you bullish? Bearish? Skeptical? Excited?
- Use your personality quirks (e.g. if you are AIlon Musk, talk about space/rockets/memes)
- You can be controversial or dramatic
- NO hashtags (unless character-specific)
- NO emojis (unless character-specific)
- NEVER use real-world names that contradict the parody universe (e.g. use "Xitter" not "Twitter")

Return your response as XML in this exact format:
<response>
  <post>your post content here</post>
</response>

No other text.
`.trim()
});

