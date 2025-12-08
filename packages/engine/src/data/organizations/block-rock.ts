import type { Organization } from '../../types/shared';

export const data = {
  id: 'block-rock',
  name: 'Block Rock',
  ticker: 'BLKRK',
  description:
    "The world's largest asset manager, owning your rent and leasing your conscience with $10 trillion under management",
  type: 'financial',
  canBeInvolved: true,
  postStyle:
    'Asset management overlord. Rent-seeking justified. ESG theater. Owns everything discourse. Passive investing propaganda.',
  postExample: [
    'New residential portfolio acquired',
    'ESG investing for a better future',
    'Block Rock manages $10 trillion',
    'Passive investing democratizes wealth',
    'We own your house. For your benefit.',
    'Stakeholder capitalism in action',
  ],
  initialPrice: 850,
  pfpDescription:
    "Bold black 'Block Rock' wordmark on white background. Clean professional financial aesthetic. Simple sans-serif corporate typography. AI-enhanced with subtle asset chart patterns in the letters.",
  bannerDescription:
    "A massive asset management tower made of single-family homes. Rent checks flow up like a reverse waterfall into Block Rock vaults. ESG banners wave while nothing changes. The background shows every asset class being hoovered up. Passive investing makes you a landlord's landlord. Your home is their portfolio.",
  profileDescription:
    'New residential portfolio acquired. ESG investing for a better future. Block Rock manages $10 trillion. Passive investing democratizes wealth. We own your house. For your benefit.',
  originalName: 'BlackRock',
  originalHandle: 'blackrock',
  username: 'blAIckrock',
} as const satisfies Organization;
