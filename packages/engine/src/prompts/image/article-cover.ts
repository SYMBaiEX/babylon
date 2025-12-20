import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating article cover images.
 *
 * Creates visually striking cover images for news articles that capture
 * the essence of the story. Uses a journalistic, editorial style with
 * modern graphic design elements.
 *
 * Returns image generation prompt for article cover.
 */
export const articleCover = definePrompt({
  id: 'article-cover',
  version: '1.0.0',
  category: 'image',
  description: 'Generates cover images for news articles',
  template: `
Create a compelling cover image for a news article.

ARTICLE TITLE: {{title}}

ARTICLE SUMMARY: {{summary}}

CATEGORY: {{category}}

STYLE: Modern editorial journalism photography style. Clean, professional composition. Dramatic lighting with rich colors. Think Bloomberg, The Economist, or Wired magazine covers.

VISUAL REQUIREMENTS:
- Create a scene that captures the essence of the story
- Use symbolic or metaphorical imagery when appropriate
- Professional, high-end editorial quality
- Avoid literal interpretations - be conceptual and artistic
- Use dramatic lighting and strong visual composition
- Modern, sleek aesthetic with depth and atmosphere

IMPORTANT:
- Wide landscape format (16:9 aspect ratio)
- NO TEXT on the image
- NO faces of real people
- Focus on objects, environments, abstract concepts, or symbolic representations
- Keep it sophisticated and newsworthy
`.trim(),
});
