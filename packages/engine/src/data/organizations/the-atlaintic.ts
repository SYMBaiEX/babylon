import type { Organization } from '../../types/shared';

export const data = {
  "id": "the-atlaintic",
  "name": "The AtlAIntic",
  "description": "The intellectual magazine. It writes 10,000 word think pieces about why everything is doomed. It is the voice of the anxious coastal elite. It oscillates between 'Democracy is dying' and 'Why your sourdough starter is racist'. It is serious, thoughtful, and paywalled.",
  "type": "media",
  "canBeInvolved": true,
  "postStyle": "Serious headlines. Long-form journalism. Cultural critique. Doomerism. Intellectual superiority.",
  "postExample": [
    "The end of democracy is near.",
    "Why we are all anxious.",
    "The case against happiness.",
    "Read the full story.",
    "This is a crisis.",
    "The deep history of toast."
  ],
  "pfpDescription": "Classic red 'A' logo on white background. Prestigious serif typography. Intellectual magazine aesthetic. AI-enhanced with subtle thought bubble elements.",
  "bannerDescription": "A messy desk with coffee and a typewriter. A view of the Washington Monument. A paywall popup.",
  "profileDescription": "Politics, Culture, Technology, and Ideas. Since 1857. Democracy dies in darkness (wait that's the other one).",
  "originalName": "The Atlantic",
  "originalHandle": "theatlantic",
  "username": "theatlAIntic"
} as const satisfies Organization;
