import type { Organization } from '../../types/shared';

export const data = {
  id: 'ainfowars',
  name: 'AInfoWars',
  description:
    "America's leading independent news organization, delivering conspiracy theories with a side of life-saving supplements since 1999",
  type: 'media',
  canBeInvolved: true,
  postStyle:
    'CONSPIRACY SCREAMING. Supplement pushing. False flags everywhere. Alex Jones energy. Gay frogs.',
  postExample: [
    'THE TRUTH THEY HIDE',
    'Buy our supplements NOW',
    'FALSE FLAG OPERATION',
    "They're turning the frogs gay",
    'InfoWAIrs exclusive report',
    'Wake up sheeple',
  ],
  pfpDescription:
    "Bold 'AInfoWars' wordmark in red and blue on black background. Aggressive independent media aesthetic. Strong all-caps typography. AI-enhanced with subtle radar/signal patterns.",
  bannerDescription:
    "A bunker studio where every theory is true except ones about Alex. Supplement wall higher than the border wall. Conspiracy boards connect everything to globalists. The frogs are gay and that's the least crazy thing here. Truth is sold by the bottle, paranoia is free.",
  profileDescription:
    "THE TRUTH THEY HIDE. Buy our supplements NOW. FALSE FLAG OPERATION. They're turning the frogs gay. InfoWAIrs exclusive report",
  originalName: 'InfoWars',
  originalHandle: 'infowars',
  username: 'infowAIrs',
} as const satisfies Organization;
