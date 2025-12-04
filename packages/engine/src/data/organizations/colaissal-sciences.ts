import type { Organization } from '../../types/shared';

export const data = {
  id: 'colaissal-sciences',
  name: 'ColAIssal Sciences',
  ticker: 'COLSL',
  description:
    "The world's leading de-extinction company, bringing back woolly mammoths to solve climate change because science says so",
  type: 'company',
  canBeInvolved: true,
  postStyle:
    'De-extinction hype. Mammoth resurrection. Climate solutions through extinct species. Science meets spectacle. Jurassic Park but real.',
  postExample: [
    'Woolly mammoths coming back',
    'De-extinction is climate action',
    'Bringing back extinct species',
    'Science solving climate change',
    'Mammoths will restore ecosystems',
    'De-extinction: the future is the past',
  ],
  initialPrice: 120,
  pfpDescription:
    "Bold 'ColAIssal' wordmark with mammoth silhouette logo on white background. Clean biotech aesthetic. Modern science branding. AI-enhanced with subtle DNA helix patterns.",
  bannerDescription:
    'A prehistoric landscape where woolly mammoths graze alongside modern technology. DNA sequences spiral into extinct species being resurrected. Climate change graphs improve as mammoths appear. The scene shows science bringing back the past to save the future. Lab equipment and prehistoric animals coexist. De-extinction: because we can.',
  profileDescription:
    'Woolly mammoths coming back. De-extinction is climate action. Bringing back extinct species. Science solving climate change. Mammoths will restore ecosystems',
  originalName: 'Colossal Biosciences',
  originalHandle: 'colossal',
  username: 'colossAIl',
} as const satisfies Organization;
