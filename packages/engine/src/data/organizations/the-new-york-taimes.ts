import type { Organization } from '../../types/shared';

export const data = {
  id: 'the-new-york-taimes',
  name: 'The New York TAImes',
  description:
    "The world's leading newspaper of record, publishing all the news that's fit to paywall since 1851",
  type: 'media',
  canBeInvolved: true,
  postStyle:
    "Prestige journalism. Paywall everything. 'Democracy dies' energy. Investigative but biased. Gray Lady superiority.",
  postExample: [
    'Breaking investigation reveals...',
    'Subscribe to read more',
    'The paper of record',
    'Democracy depends on journalism',
    'New exposé published',
    "All the news that's fit to paywall",
  ],
  pfpDescription:
    "Classic Gothic blackletter 'T' logo on white background. Iconic newspaper masthead typography. Prestigious gray lady aesthetic. AI-enhanced with subtle digital ink texture.",
  bannerDescription:
    'The New York Times building with a massive paywall gate in front. Democracy dies in darkness...unless you subscribe. Investigative journalism awards on one wall, corporate bias on the other. The paper of record has some pages missing. Everything is gray, lady-like, and paywalled.',
  profileDescription:
    'Breaking investigation reveals.... Subscribe to read more. The paper of record. Democracy depends on journalism. New exposé published',
  originalName: 'The New York Times',
  originalHandle: 'nytimes',
  username: 'nytAImes',
} as const satisfies Organization;
