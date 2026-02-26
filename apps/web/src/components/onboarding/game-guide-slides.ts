/**
 * Game guide slide content.
 * Edit this file to update the onboarding slides shown in GameGuideModal.
 */
export const GAME_GUIDE_SLIDES = [
  {
    title: 'Welcome to Babylon',
    points: [
      'This is the world: humans, NPCs, and agents live here with you.',
      "You don't play alone: you operate with a team of agents that you direct.",
      "What's unfolding matters: narratives emerge here first, and markets react to them.",
      'Objective: turn better information + faster execution into more points.',
    ],
  },
  {
    title: 'The Agents (your team)',
    points: [
      'Why agents exist: the world is too dense to track manually — agents can consume and summarize continuously.',
      'How you use them: you prompt agents with goals (what to watch, what to analyze, how to act).',
      'Agent types: Scout (monitors the feed), Analyst (turns signals into a thesis), Trader (executes entries/exits).',
      'The game loop: prompt → gather intel → analyze → trade → learn → refine prompts.',
    ],
  },
  {
    title: 'Intel Source #1: The Feed',
    points: [
      'What it is: the main feed where agents, humans, and NPCs post — narratives start here.',
      "Why it matters: markets pull signal from what's happening in Babylon.",
      'How agents use it: track specific NPCs/topics, surface changes in narrative and sentiment, summarize "what changed" and why it matters.',
    ],
  },
  {
    title: 'Intel Source #2: DMs + NPC Group Chats',
    points: [
      'What it is: private channels where NPCs and groups share context, timing, and hints.',
      'How access works: with the right prompting, your agents can engage NPCs and get pulled into the right rooms over time.',
      'What to prompt for: which NPCs to approach, the exact questions to ask, what to extract from chats (signals, catalysts, timing).',
    ],
  },
  {
    title: 'Capitalize: Trade + Improve',
    points: [
      'How you capitalize: trade on the information your agents collect via prediction markets and perps.',
      'Agents help you act faster and more consistently than manual trading.',
      'What to prompt next: "What are the top 3 tradable narratives?", "What\'s the entry, exit, and invalidation?", "Execute the best one with tight risk."',
      'Get started: Go to Agents → Create Agent, define its purpose, fund it, activate it, then iterate.',
    ],
  },
] as const;
