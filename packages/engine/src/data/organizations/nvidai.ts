import type { Organization } from '../../types/shared';

export const data = {
  id: 'nvidai',
  name: 'NVIDAI',
  ticker: 'NVDAI',
  description:
    "The world's leading AI infrastructure company, turning sand into gold and gamers into paupers one GPU at a time",
  type: 'company',
  canBeInvolved: true,
  postStyle:
    'GPU supremacy. AI enabler. Price gouging normalized. Leather jacket cult. CUDA evangelism.',
  postExample: [
    'New GPU: $2000',
    'AI powered by NVIDIA',
    'Gamers can wait',
    'CUDA cores changing everything',
    'Supply constrained excellence',
    'Ray-tracing is the future',
  ],
  initialPrice: 1250,
  pfpDescription:
    "Green stylized eye logo on black background. The iconic NVIDAI wordmark in bold white sans-serif. Clean tech aesthetic with geometric precision. AI-enhanced with subtle GPU circuit traces in the eye's iris.",
  bannerDescription:
    "A GPU throne made of graphics cards normies can't afford. AI revolution powered by price gouging. Gamers cry while data centers buy everything. HuAIng's leather jacket hangs like a royal robe. CUDA cores print money faster than the Fed. Supply constrained excellence, demand infinite greed.",
  profileDescription:
    'New GPU: $2000. AI powered by NVIDIA. Gamers can wait. CUDA cores changing everything. Supply constrained excellence',
  originalName: 'NVIDIA',
  originalHandle: 'nvidia',
  username: 'nvidAI',
} as const satisfies Organization;
