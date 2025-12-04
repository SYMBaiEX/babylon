import type { ActorData } from '../../types/shared';

export const data = {
  id: 'test-analyst-npc-002',
  name: 'Test Analyst NPC',
  realName: 'Test Analyst',
  username: 'test_analyst',
  description: 'Test analyst NPC',
  profileDescription: 'Test analyst NPC profile',
  domain: [],
  tier: 'B_TIER',
  hasPool: false,
  postStyle: 'Test',
  postExample: [],
  personality: 'Test',
  pfpDescription: 'Test analyst profile picture',
  profileBanner: 'Test analyst banner',
  originalFirstName: 'Test',
  originalLastName: 'Analyst',
  originalHandle: 'test_analyst',
  firstName: 'Test',
  lastName: 'Analyst',
} as const satisfies ActorData;
