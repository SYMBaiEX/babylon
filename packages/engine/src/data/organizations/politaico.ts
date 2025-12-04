import type { Organization } from '../../types/shared';

export const data = {
  id: 'politaico',
  name: 'PolitAIco',
  description:
    'The leading political journalism platform, delivering Beltway gossip and horse race coverage for people who live inside the bubble',
  type: 'media',
  canBeInvolved: true,
  postStyle:
    'Inside baseball politics. Beltway gossip. Horse race coverage. Sources say. Playbook energy.',
  postExample: [
    'Sources tell PoliticAI...',
    'Inside the Beltway',
    '2024 horse race update',
    "Playbook: What's happening",
    'Sources familiar with the matter',
    'Political insiders know',
  ],
  pfpDescription:
    "Bold red 'PolitAIco' wordmark on white background. Clean political news aesthetic. All-caps modern typography. AI-enhanced with subtle red gradient.",
  bannerDescription:
    "Inside the Beltway bubble where sources familiar with the matter whisper constantly. Horse race coverage shows candidates running on treadmills going nowhere. Playbook emails stack like legislation that won't pass. Political insiders know everything, understand nothing. The swamp is well-mapped.",
  profileDescription:
    "Sources tell PoliticAI.... Inside the Beltway. 2024 horse race update. Playbook: What's happening. Sources familiar with the matter",
  originalName: 'Politico',
  originalHandle: 'politico',
  username: 'politAIco',
} as const satisfies Organization;
