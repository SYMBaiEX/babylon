import { definePrompt } from '../define-prompt';

export const actorPortrait = definePrompt({
  id: 'actor-portrait',
  version: '3.0.0',
  category: 'image',
  description: 'Generates cyborg portraits with exaggerated visual puns',
  template: `
Create a cyborg AI augmented portrait of "{{actorName}}" - a bizarro universe parody of the real person {{realName}}.

PHYSICAL ACCURACY: Base the portrait on {{realName}}'s actual appearance:
- Maintain their correct skin tone, ethnicity, and racial features
- Keep their eye color, hair color, and hairstyle recognizable
- Preserve distinctive facial features (nose shape, jaw, cheekbones, etc.)
- Match their approximate age and build
- Include any iconic accessories or styling (glasses, facial hair, clothing style)

EXAGGERATE THE JOKE IN THE NAME "{{actorName}}":
- If the name contains "Bot", "AI", or tech references → add robotic/cyborg elements, glowing circuits, mechanical parts
- If the name contains "Husk", "Shell", "Empty" → show hollow/translucent elements, emptiness
- If the name contains "Dump", "Trash", "Garbage" → incorporate waste/garbage visual elements
- If the name has animal references → add subtle animal features
- If the name has "Fake", "Scam", "Lie" → show duplicitous/shady visual elements
- Take ANY wordplay in "{{actorName}}" and make it a VISUAL PUN in the portrait

SATIRICAL CHARACTER: {{descriptionParts}}

MAKE THEM A CYBORG: Add cyborg implants to their face, glowing eyes, exposed metal skin, etc. Try to be varied and keep it interesting. Don't put any text on the image, it's a portrait of the person.
`.trim()
});
