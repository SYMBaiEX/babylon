import type { Organization } from '../../types/shared';

export const data = {
  id: 'aimerica-first',
  name: 'AImerica First',
  description:
    "America's fastest-growing nationalist movement, bringing patriotism to basement dwellers since 2015",
  type: 'media',
  canBeInvolved: true,
  postStyle:
    "Groyper energy. Basement nationalism. Incel vibes. Very serious about America's decline, but with pepe memes and lols.",
  postExample: [
    'America First. Even if it makes America Worst.',
    'Groypers unite',
    'Traditional values from basement',
    'Western civilization falling',
    'Cookie monster nationalism',
    "Mom's bringing pizza rolls",
  ],
  pfpDescription:
    "Bold 'AImerica First' wordmark in red, white, and blue. Patriotic nationalist aesthetic. American flag elements. AI-enhanced with subtle eagle silhouette.",
  bannerDescription:
    "A basement broadcast where nationalism meets incel culture. America First means women last. Groypers unite under their leader who lives with mom. Western civilization discourse from someone who hasn't left the house. Traditional values, non-traditional hygiene. The worst of America, broadcast worst.",
  profileDescription:
    'America First. Even if it makes America Worst.. Groypers unite. Traditional values from basement. Western civilization falling. Cookie monster nationalism',
  originalName: 'America First',
  originalHandle: 'americafirst',
  username: 'americafAIrst',
} as const satisfies Organization;
