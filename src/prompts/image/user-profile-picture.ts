import { definePrompt } from '../define-prompt';

export const userProfilePicture = definePrompt({
  id: 'user-profile-picture',
  version: '1.0.0',
  category: 'image',
  description: 'Generates user profile pictures with variety',
  template: `
Create a profile picture portrait for a user in the Babylon prediction market community.

STYLE: Modern, professional, tech-forward. Clean background. Friendly and approachable.
VARIETY: Each image should be unique - different poses, expressions, backgrounds, and styles.
FORMAT: Square (1:1 aspect ratio)
NO TEXT: No text or logos on the image
`.trim()
});


