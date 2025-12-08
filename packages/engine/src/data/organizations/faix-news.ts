import type { Organization } from '../../types/shared';

export const data = {
  id: 'faix-news',
  name: 'FAIX News',
  description:
    "America's most-watched news network, providing fair and balanced opinions disguised as news 24 hours a day",
  type: 'media',
  canBeInvolved: true,
  postStyle:
    'Right-wing outrage. Opinion as news. Sucker worship. Culture war 24/7. Fair and balanced lies.',
  postExample: [
    'BREAKING: Democrats bad',
    'Fair and Balanced™',
    'Sucker was right',
    'The left is destroying America',
    'Culture war update',
    'Opinion presented as news',
  ],
  pfpDescription:
    "Bold 'FAIX NEWS' wordmark in white on blue background. Clean broadcast news aesthetic with red accent stripe. Professional network branding. AI-enhanced with subtle digital scan lines.",
  bannerDescription:
    'A news desk where opinion hosts outnumber journalists 10:1. Culture war flames burn on both sides. The background alternates between BREAKING NEWS alerts and supplement ads. Sucker Carlton broadcasts from his shed visible through a window. Fair and Balanced banner has an asterisk leading nowhere.',
  profileDescription:
    'BREAKING: Democrats bad. Fair and Balanced™. Sucker was right. The left is destroying America. Culture war update',
  originalName: 'Fox News',
  originalHandle: 'foxnews',
  username: 'fAIxnews',
} as const satisfies Organization;
