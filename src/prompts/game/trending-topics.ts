import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating trending topic descriptions from clustered posts.
 * 
 * Analyzes post clusters to create catchy trend names and micro-summaries.
 * Output is satirical and captures the essence of social media conversations.
 */
export const trendingTopics = definePrompt({
  id: 'trending-topics',
  version: '1.0.0',
  category: 'game',
  description: 'Generates trend names and descriptions from post clusters',
  temperature: 0.85,
  maxTokens: 2000,
  template: `Analyze TRENDING TOPICS on a social platform.

TOPICS (by frequency + recency):
{{topicsList}}

For each, create: 1) Catchy trend name (3-6 words, title case) 2) Micro-summary (1-2 sentences). Be satirical.

XML: <response><trends><trend><trendName>...</trendName><description>...</description></trend></trends></response>`.trim()
});

