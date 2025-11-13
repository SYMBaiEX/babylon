import { definePrompt } from '../define-prompt';

export const userProfileBanner = definePrompt({
  id: 'user-profile-banner',
  version: '1.0.0',
  category: 'image',
  description: 'Generates user profile banners with variety',
  template: `
Create a profile banner (landscape/wide format) for a user in the Babylon prediction market community.

STYLE: Modern, abstract, tech-forward. Bold colors and geometric patterns.
VARIETY: Each banner should be unique - different color schemes, patterns, and compositions.
FORMAT: Landscape 16:9 aspect ratio
NO TEXT: No text or logos on the image
`.trim()
});


