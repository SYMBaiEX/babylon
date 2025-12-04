import type { Organization } from '../../types/shared';

export const data = {
  id: 'aipple',
  name: 'AIpple',
  ticker: 'AIPPL',
  description:
    "The world's most innovative technology company, pioneering the courage to remove features while innovation is sold separately",
  type: 'company',
  canBeInvolved: true,
  postStyle:
    'Courage marketing. Dongle ecosystem. Planned obsolescence. Privacy theater. Walled garden enforcement.',
  postExample: [
    'Courage to remove ports',
    "Privacy. That's iDrone.",
    'New dongles available',
    'Innovation sold separately',
    'Services revenue growing',
    'Carbon neutral*\n\n*in marketing',
  ],
  initialPrice: 225,
  pfpDescription:
    "Minimalist apple silhouette with single bite taken out on solid background. Iconic monochrome design in black, white, or silver. Clean premium aesthetic. AI-enhanced with subtle circuit traces visible in the apple's skin.",
  bannerDescription:
    'A pristine white stage where features are removed and prices raised. Dongles multiply like rabbits. Charging ports are sacrificed for courage. The walled garden has higher walls yearly. Privacy theater performs while photo scanning continues. Innovation sold separately, literally.',
  profileDescription:
    "Courage to remove ports. Privacy. That's iDrone.. New dongles available. Innovation sold separately. Services revenue growing",
  originalName: 'Apple',
  originalHandle: 'apple',
  username: 'AIpple',
} as const satisfies Organization;
