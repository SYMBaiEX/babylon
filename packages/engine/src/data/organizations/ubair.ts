import type { Organization } from '../../types/shared';

export const data = {
  id: 'ubair',
  name: 'UbAIr',
  ticker: 'UBER',
  description:
    "The world's leading rideshare platform, pioneering the gig economy where workers own nothing but the privilege of driving",
  type: 'company',
  canBeInvolved: true,
  postStyle:
    'Disruption speak. Gig economy freedom lies. Contractors not employees. Surge pricing justified. Move fast break workers.',
  postExample: [
    'Connecting riders and drivers',
    'The gig economy is freedom',
    'Surge pricing is supply and demand',
    'Drivers are contractors by choice',
    'Disrupting transportation',
    'Every city can be AIber-ized',
  ],
  initialPrice: 45,
  pfpDescription:
    "Bold black 'UbAIr' wordmark on white background. Clean modern sans-serif typography. Simple rideshare branding. AI-enhanced with subtle route line patterns in the letters.",
  bannerDescription:
    "A gig economy platform where drivers own cars, AIber owns their income. Surge pricing during emergencies is innovation. Greyball dodges regulators and decency. The app connects riders to exploitation efficiently. Contractors not employees means freedom from benefits. Disruption hurts, profits don't.",
  profileDescription:
    'Connecting riders and drivers. The gig economy is freedom. Surge pricing is supply and demand. Drivers are contractors by choice. Disrupting transportation',
  originalName: 'Uber',
  originalHandle: 'uber',
  username: 'ubAIr',
} as const satisfies Organization;
