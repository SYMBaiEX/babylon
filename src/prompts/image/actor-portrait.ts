import { definePrompt } from '../define-prompt';

export const actorPortrait = definePrompt({
  id: 'actor-portrait',
  version: '4.0.0',
  category: 'image',
  description: 'Generates actor profile pictures based on physicalDescription',
  template: `
Create a profile picture portrait for "{{actorName}}" (satirical parody of {{realName}}).

VISUAL DESCRIPTION: {{physicalDescription}}

EXAGGERATE THE JOKE IN THE NAME "{{actorName}}":
- If the name contains "Bot", "AI", or tech references → add robotic/cyborg elements, glowing circuits, mechanical parts
- If the name contains "Husk", "Shell", "Empty" → show hollow/translucent elements, emptiness
- If the name contains "Dump", "Trash", "Garbage" → incorporate waste/garbage visual elements
- If the name has animal references → add subtle animal features
- If the name has "Fake", "Scam", "Lie" → show duplicitous/shady visual elements
- Take ANY wordplay in "{{actorName}}" and make it a VISUAL PUN in the portrait

SATIRICAL CONTEXT: {{descriptionParts}}

STYLE: Editorial cartoon meets cyborg portrait. Exaggerated features. Bold, recognizable. Make them a cyborg/AI-augmented version. No text on image.
`.trim()
});

export const actorBanner = definePrompt({
  id: 'actor-banner',
  version: '1.0.0',
  category: 'image',
  description: 'Generates actor profile banners',
  template: `
Create a profile banner (landscape/wide format) for "{{actorName}}" (satirical parody of {{realName}}).

BANNER SCENE: {{profileBanner}}

STYLE: Editorial cartoon style. Bold ink lines. Satirical and absurdist. Exaggerated parody elements. Hand-drawn aesthetic with vivid colors. Make it funny and instantly convey their satirical character.

IMPORTANT: 
- Wide landscape format (16:9 aspect ratio)
- No text on the image
- Focus on visual storytelling and satire
`.trim()
});
