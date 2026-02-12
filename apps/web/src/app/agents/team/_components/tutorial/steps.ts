import type { TutorialStep } from '@/components/tutorial/SpotlightTutorial';

export type { TutorialStep };

export const DESKTOP_STEPS: TutorialStep[] = [
  {
    target: '[data-tour="agents-member-list"]',
    title: 'Your Agent Team',
    description:
      'This is your team of AI agents. Each agent has its own personality, wallet, and trading strategy. Click any agent to @mention them in chat.',
    placement: 'right',
  },
  {
    target: '[data-tour="agents-add-button"]',
    title: 'Create New Agents',
    description:
      'Tap here to add a new agent to your team. Customize its personality, goals, and how it interacts with markets.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="agents-chat-area"]',
    title: 'Team Chat',
    description:
      'Chat with your agents here. Use @mentions to direct specific agents. They can share market insights, make trades, and collaborate with each other.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="agents-bottom-panel"]',
    title: 'Activity & Portfolio',
    description:
      'Monitor your agents\u2019 activity, wallet balances, P&L, and logs. Switch between agents using the dropdown to track each one individually.',
    placement: 'top',
  },
];

export const MOBILE_STEPS: TutorialStep[] = [
  {
    target: '[data-tour="agents-mobile-tabs"]',
    title: 'Navigate Sections',
    description:
      'Switch between your Agents list, the team Chat, and the monitoring Panel using these tabs.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="agents-mobile-add"]',
    title: 'Create New Agents',
    description:
      'Tap here to add a new agent to your team. Customize its personality, goals, and how it interacts with markets.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="agents-mobile-chat-tab"]',
    title: 'Team Chat',
    description:
      'Chat with your agents here. Use @mentions to direct specific agents. They can share market insights and collaborate.',
    placement: 'bottom',
  },
];
