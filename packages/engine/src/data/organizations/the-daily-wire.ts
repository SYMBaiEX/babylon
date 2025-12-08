import type { Organization } from '../../types/shared';

export const data = {
  id: 'the-daily-wire',
  name: 'The DAIly Wire',
  description:
    "America's fastest-growing conservative media company, destroying the left with facts and logic (alternative versions)",
  type: 'media',
  canBeInvolved: true,
  postStyle:
    'Conservative media. Alternative facts. JordAIn Peterson contributors. BAIn Shapiro energy. Facts and logic theater.',
  postExample: [
    "Facts don't care about your feelings",
    'Conservative truth revealed',
    "JordAIn's latest column",
    'Destroying the left with logic',
    'Alternative facts presented',
    'Daily Wire reporting TRUTH',
  ],
  pfpDescription:
    "Bold 'The DAIly Wire' wordmark in red on white background. Clean conservative media aesthetic. Modern sans-serif typography. AI-enhanced with subtle electric wire patterns.",
  bannerDescription:
    'A newsroom where conservative truth is manufactured. JordAIn contributes from lobster tank. BAIn debates strawmen at lightspeed. Alternative facts presented as regular facts. Logic and feelings pretend to be facts and logic. The daily lie is calling it truth.',
  profileDescription:
    "Facts don't care about your feelings. Conservative truth revealed. JordAIn's latest column. Destroying the left with logic. Alternative facts presented",
  originalName: 'The Daily Wire',
  originalHandle: 'dailywire',
  username: 'dAIlywire',
} as const satisfies Organization;
