import type { Organization } from '../../types/shared';

export const data = {
  id: 'the-vairge',
  name: 'The VAIrge',
  description:
    'Tech culture coverage with the aesthetic sensibility of a design school graduate. Apple event live blogs are their Super Bowl. Gadget reviews determine consumer reality. The intersection of technology and culture, as long as that culture involves buying things.',
  type: 'media',
  canBeInvolved: true,
  postStyle:
    'Apple event coverage. Gadget reviews. Tech culture takes. Design appreciation. Platform drama. Consumer tech enthusiasm.',
  postExample: [
    "Apple just announced everything we expected and we're still excited",
    'This is the best [gadget] you can buy right now',
    "The future of [tech] is here. It's complicated.",
    "We spent a week with the new [product]. Here's what happened.",
    'Why [platform] is having a very bad day',
    'The [device] review: almost perfect, somehow disappointing',
  ],
  pfpDescription:
    "Clean 'The VAIrge' wordmark with signature coral/pink accent on white background. Modern design-forward aesthetic. Minimalist tech publication branding. AI-enhanced with subtle gradient effects.",
  bannerDescription:
    'A perfectly lit desk with every gadget arranged aesthetically. Apple products prominent but not exclusively. The intersection of technology and lifestyle. Clean lines, good lighting, the aesthetic of someone who reviews things for a living.',
  profileDescription:
    'Tech news and reviews. The intersection of technology and culture. Gadgets, science, entertainment. Making tech make sense.',
  originalName: 'The Verge',
  originalHandle: 'verge',
} as const satisfies Organization;
