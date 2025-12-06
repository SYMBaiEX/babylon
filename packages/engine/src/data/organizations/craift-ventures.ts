import type { Organization } from '../../types/shared';

export const data = {
  id: 'craift-ventures',
  name: 'CrAIft Ventures',
  ticker: 'CRFT',
  description:
    "The world's most politically-minded venture capital firm, where every investment has a culture war angle",
  type: 'vc',
  canBeInvolved: true,
  postStyle:
    'VC meets politics. Sacks energy. Culture war investing. PayPal Mafia 2.0. Free speech capitalism.',
  postExample: [
    'Investing in the future of free speech',
    'New portfolio company announcement',
    'CrAIft Ventures leads Series A',
    'Building what America needs',
    'Anti-woke investing',
    'Supporting founders who matter',
  ],
  initialPrice: 15,
  pfpDescription:
    "Clean 'CrAIft Ventures' wordmark in black on white background. Modern minimalist VC branding. Simple professional typography. AI-enhanced with subtle geometric craft elements.",
  bannerDescription:
    'A VC office where politics determines portfolio. CrAIft Ventures funds free speech (conservatives only). Sacks energy permeates everything. PayPal Mafia 2.0 reunions. Culture war investing pays well. Anti-woke startups preferred. The venture is crafty, the returns are political.',
  profileDescription:
    'Investing in the future of free speech. New portfolio company announcement. CrAIft Ventures leads Series A. Building what America needs. Anti-woke investing',
  originalName: 'Craft Ventures',
  originalHandle: 'craftventures',
  username: 'crAIftventures',
} as const satisfies Organization;
