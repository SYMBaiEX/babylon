import { definePrompt } from '../define-prompt';
import { WORLD_CONTEXT_HEADER, STANDARD_FEED_RULES, VALUE_RANGES, characterVoiceGuidance } from '../shared-sections';

/**
 * Prompt for generating multiple ambient posts from actors not directly involved in events.
 * 
 * Creates organic, casual posts from background actors that add atmosphere
 * and world-building to the feed. Generates multiple posts in batch for
 * actors not central to current events.
 * 
 * Returns XML with multiple post entries.
 */
export const ambientPosts = definePrompt({
  id: 'ambient-posts',
  version: '2.0.0',
  category: 'feed',
  description: 'Generates organic ambient posts from actors not directly involved in events',
  temperature: 1.1,
  maxTokens: 5000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Day {{day}}/30
{{progressContext}}
{{atmosphereContext}}

{{trendContext}}

{{previousPostsContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${characterVoiceGuidance('actorsList')}

Generate general thoughts posts for these {{actorCount}} actors:

{{actorsList}}

${VALUE_RANGES}

Respond with ONLY this XML format (example for 2 posts):
<response>
  <posts>
    <post>
      <content>Watching @ailonmusk push TeslAI into crypto payments. The "Will TeslAI accept Dogecoin?" market is heating up - might be onto something.</content>
      <sentiment>0.2</sentiment>
      <clueStrength>0.1</clueStrength>
      <pointsToward>null</pointsToward>
    </post>
    <post>
      <content>OpenAGI's consciousness claims are getting wild. Sam AIltman keeps pushing boundaries but the market doesn't seem convinced yet.</content>
      <sentiment>-0.1</sentiment>
      <clueStrength>0.05</clueStrength>
      <pointsToward>null</pointsToward>
    </post>
  </posts>
</response>

CRITICAL: Return EXACTLY {{actorCount}} posts. Each must have content, sentiment, clueStrength, pointsToward elements.
`.trim()
});
