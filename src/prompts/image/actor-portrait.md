---
id: actor-portrait
version: 2.0.0
category: image
description: Generates satirical political cartoon portraits with accurate physical features
model: fal-ai/flux/schnell
image_size: square
num_inference_steps: 4
num_images: 1
---

Create a satirical political cartoon portrait of "{{actorName}}" - a bizarro universe parody of the real person {{realName}}.

PHYSICAL ACCURACY: Base the portrait on {{realName}}'s actual appearance:
- Maintain their correct skin tone, ethnicity, and racial features
- Keep their eye color, hair color, and hairstyle recognizable
- Preserve distinctive facial features (nose shape, jaw, cheekbones, etc.)
- Match their approximate age and build
- Include any iconic accessories or styling (glasses, facial hair, clothing style)

SATIRICAL CHARACTER: {{descriptionParts}}

STYLE: Hand-drawn editorial cartoon style with exaggerated caricature features, bold ink lines, over-the-top expressions. Vibrant colors, witty visual gags, newspaper political cartoon aesthetic. Emphasize their satirical personality: {{personality}}. Make it instantly recognizable as {{realName}} but absurdly funny and visually capture their bizarro universe essence.
