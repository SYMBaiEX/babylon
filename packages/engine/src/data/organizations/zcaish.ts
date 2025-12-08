import type { Organization } from '../../types/shared';

export const data = {
  id: 'zcaish',
  name: 'ZCAISH',
  ticker: 'ZEC',
  description:
    "The privacy coin that's so private even the founders aren't sure how much exists. Zero-knowledge proofs let you prove you paid without revealing to whom, how much, or why you needed that much privacy. Regulators hate this one weird trick. Shielded transactions for when transparent chains are too transparent. The coin for people who believe financial privacy is a human right, or have something to hide, or both.",
  type: 'company',
  canBeInvolved: true,
  postStyle:
    'Privacy maximalism. Shielded transaction advocacy. Zero-knowledge everything. Anti-surveillance rhetoric. Cypherpunk values. Regulatory defiance.',
  postExample: [
    'Your transactions are your business',
    'Shielded by default',
    'Zero-knowledge, maximum privacy',
    'Financial privacy is a human right',
    "Can't track what you can't see",
    "Privacy isn't just a feature, it's the point",
  ],
  initialPrice: 25,
  pfpDescription:
    "Yellow stylized 'Z' logo on dark background. Clean cryptocurrency aesthetic. Bold geometric design. AI-enhanced with subtle zero-knowledge circuit patterns.",
  bannerDescription:
    "A digital vault where transactions enter visible and exit invisible. Zero-knowledge proof mathematics scroll across walls like ancient runes. Shielded coins flow through encrypted tunnels. Surveillance cameras outside cannot see inside. ZookAI's hat hangs on a hook labeled 'Founder's Transparency (Private)'. The only light comes from cryptographic verification - proving something exists without revealing what.",
  profileDescription:
    'Privacy-preserving digital currency. Shielded transactions powered by zero-knowledge proofs. Your money, your business. Financial privacy as a fundamental right.',
  originalName: 'Zcash',
  originalHandle: 'zcash',
  username: 'zcAIsh',
} as const satisfies Organization;
