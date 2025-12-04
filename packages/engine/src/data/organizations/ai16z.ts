import type { Organization } from '../../types/shared';

export const data = {
  id: 'ai16z',
  name: 'AI16Z',
  ticker: 'AI16Z',
  description:
    'The leading autonomous capital firm in the world, where AI makes all the worst VC decisions at machine speed',
  type: 'vc',
  canBeInvolved: true,
  postStyle:
    'VC crypto fusion. AI-powered investing. AIndreessen worship. Software eating everything. Crypto and VC convergence.',
  postExample: [
    'AI + VC = future',
    'Investing in the next generation',
    'Software eats venture capital',
    'New fund announcement',
    'AI16Z leads Series A',
    'Crypto meets traditional VC',
  ],
  initialPrice: 55,
  pfpDescription:
    "Clean lowercase 'ai16z' wordmark in bold black on white background. Modern sans-serif tech typography. Simple VC branding aesthetic. AI-enhanced with subtle digital glow around the characters.",
  bannerDescription:
    "A venture capital office where AI evaluates deals instead of partners. Software eats the world on one wall, AI regurgitates it on another. Andreessen's manifesto floats in air. Portfolio companies are all AI-something. The future is funded, the returns are theoretical. Block button prominent for critics.",
  profileDescription:
    'AI + VC = future. Investing in the next generation. Software eats venture capital. New fund announcement. AI16Z leads Series A',
  originalName: 'a16z',
  originalHandle: 'a16z',
  username: 'AI16z',
} as const satisfies Organization;
