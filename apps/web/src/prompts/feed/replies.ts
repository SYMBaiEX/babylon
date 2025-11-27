import { definePrompt } from '../define-prompt';
import {
  characterVoiceGuidance,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating multiple reply posts creating conversations.
 *
 * Generates a thread of replies from multiple actors responding to an
 * original post, creating natural conversation flows. Maintains character
 * voices and builds on previous replies in the thread.
 *
 * Returns XML with multiple reply entries forming a conversation.
 */
export const replies = definePrompt({
  id: 'replies',
  version: '2.0.0',
  category: 'feed',
  description:
    'Generates reply posts to existing posts, creating conversations',
  temperature: 1,
  maxTokens: 5000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Post: @{{originalAuthorName}}: "{{originalContent}}"

{{relationshipContext}}

{{groupContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${characterVoiceGuidance('repliersList')}

Generate reply posts from these {{replierCount}} actors:

{{repliersList}}

${VALUE_RANGES}

Respond with ONLY this XML format (example for 2 replies):
<response>
  <replies>
    <reply>
      <post>Interesting take! I've been saying this for months. Glad others are catching on.</post>
      <sentiment>0.5</sentiment>
      <clueStrength>0.2</clueStrength>
      <pointsToward>null</pointsToward>
    </reply>
    <reply>
      <post>Hard disagree. This completely ignores the technical challenges. Not happening.</post>
      <sentiment>-0.6</sentiment>
      <clueStrength>0.3</clueStrength>
      <pointsToward>false</pointsToward>
    </reply>
  </replies>
</response>

CRITICAL: Return EXACTLY {{replierCount}} replies. Each must have post, sentiment, clueStrength, pointsToward elements.
`.trim(),
});
