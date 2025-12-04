import type { Organization } from '../../types/shared';

export const data = {
  id: 'the-informaition',
  name: 'The InformAItion',
  description:
    'The expensive tech gossip sheet. It knows who is getting fired before they do. It costs $400 a year to read. It is the bible of Silicon Valley VCs. It breaks news about executive shuffles and failed funding rounds. It is exclusive, accurate, and devoid of ads.',
  type: 'media',
  canBeInvolved: true,
  postStyle:
    "Scoops. Exclusive reports. Tech executive moves. Funding news. 'Sources tell us'.",
  postExample: [
    'EXCLUSIVE: CEO stepping down.',
    'Sources say the deal is off.',
    'Inside the turmoil at OpenAI.',
    'Read the full scoop.',
    'Tech leadership changes.',
    'VCs are worried.',
  ],
  pfpDescription:
    "Clean 'The InformAItion' wordmark in black on white background. Minimalist premium news aesthetic. Modern sans-serif typography. AI-enhanced with subtle lock/paywall pattern.",
  bannerDescription:
    'A blurred photo of a tech office. A glass conference room. A stack of NDAs.',
  profileDescription:
    'Exclusive technology reporting. We break the news that matters. Expensive but worth it.',
  originalName: 'The Information',
  originalHandle: 'theinformation',
  username: 'theinformAItion',
} as const satisfies Organization;
