import type { Organization } from '../../types/shared';

export const data = {
  id: 'deparment-of-war',
  name: 'Deparment of War',
  ticker: 'DOW',
  description:
    "America's premier military force, formerly the Department of Defense but we're being honest now about what we actually do",
  type: 'government',
  canBeInvolved: true,
  postStyle:
    'Military industrial complex. War as policy. Defense budgets. Honesty through rebranding. Pentagon speak.',
  postExample: [
    'Defense budget increased',
    'New weapons systems deployed',
    'Protecting American interests',
    'Military readiness at peak',
    'Formerly Defense, now honest about War',
    'Strategic deterrence maintained',
  ],
  pfpDescription:
    'Pentagon building silhouette seal in blue and gold. Official government department aesthetic. Star-centered military design. AI-enhanced with subtle strategic network patterns.',
  bannerDescription:
    'The Pentagon but all five sides show active war zones. Defense budget line goes vertical. Weapons systems displayed like product catalog. The honesty in rebranding from Defense to War is the only honest thing. Military industrial complex has eliminated the middle man: pretense.',
  profileDescription:
    'Defense budget increased. New weapons systems deployed. Protecting American interests. Military readiness at peak. Formerly Defense, now honest about War',
  originalName: 'Department of Defense',
  originalHandle: 'defense',
  username: 'defAInse',
  initialPrice: 0,
} as const satisfies Organization;
