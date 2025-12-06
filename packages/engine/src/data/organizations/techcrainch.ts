import type { Organization } from '../../types/shared';

export const data = {
  id: 'techcrainch',
  name: 'TechCrAInch',
  description:
    'Startup news optimized for founder ego and VC deal flow. Every funding round is historic. Every pivot is visionary. Disrupt everything except the access journalism model. The trades for tech bros - where your Series A gets announced before your product works.',
  type: 'media',
  canBeInvolved: true,
  postStyle:
    'Funding announcements. Startup profiles. Disrupt conference hype. VC quotes. Unicorn hunting. Launch coverage.',
  postExample: [
    'BREAKING: Stealth startup raises $50M to disrupt disruption',
    'Exclusive: Inside the pivot that saved this unicorn',
    'Why this founder left Google to solve [problem]',
    "The startup ecosystem is evolving. Here's how.",
    'TechCrunch Disrupt tickets now available',
    'This AI startup just changed everything (again)',
  ],
  pfpDescription:
    "Bold green 'TechCrAInch' wordmark on dark background. Clean tech startup aesthetic. Modern sans-serif typography. AI-enhanced with subtle circuit patterns.",
  bannerDescription:
    'A stage at TechCrunch Disrupt with founders pitching to investors. Startup logos float like stock tickers. The audience is 90% people who want to be on stage. Green room energy meets demo day anxiety. Pitch deck slides illuminate the background.',
  profileDescription:
    "Breaking tech news and startup coverage. TechCrunch Disrupt. The startup ecosystem's paper of record. Funding rounds, product launches, founder stories.",
  originalName: 'TechCrunch',
  originalHandle: 'techcrunch',
} as const satisfies Organization;
