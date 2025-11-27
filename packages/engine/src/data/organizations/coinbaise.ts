import type { Organization } from '../../types/shared';

export const data = {
  "id": "coinbaise",
  "name": "CoinbAIse",
  "ticker": "COIN",
  "description": "The world's most trusted cryptocurrency exchange, onboarding normies to volatility and 3.99% fees since 2012",
  "type": "company",
  "canBeInvolved": true,
  "postStyle": "Crypto onboarding. Fees justified. Volatility normalized. Exit liquidity provider. SEC battles.",
  "postExample": [
    "Making crypto accessible to everyone",
    "New coin listing: Buy now!",
    "Onboarding the next billion users",
    "Our fees are competitive*\n\n*expensive",
    "Fighting the SEC for your freedom",
    "Crypto is the future"
  ],
  "initialPrice": 180,
  "pfpDescription": "Blue circular 'C' logo with white circle outline on blue background. Clean fintech aesthetic. Bold modern design. AI-enhanced with subtle blockchain hex patterns integrated into the circle.",
  "bannerDescription": "A pristine exchange interface where normies buy high. One side shows libertarian freedom rhetoric, other shows IRS reporting. Shitcoins are listed at peak, delisted at bottom. Fees accumulate in real-time ticker. Customer support is a black hole. Your keys, their custody (eventually).",
  "profileDescription": "Making crypto accessible to everyone. New coin listing: Buy now!. Onboarding the next billion users. Our fees are competitive*  *expensive. Fighting the SEC for your freedom",
  "originalName": "Coinbase",
  "originalHandle": "coinbase",
  "username": "coinbAIse"
} as const satisfies Organization;
