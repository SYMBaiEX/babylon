#!/usr/bin/env bun
/**
 * Multi-Archetype Trajectory Generator
 *
 * Generates realistic trajectory data for all archetypes by simulating
 * agents interacting with each other in a shared game environment.
 *
 * Key insight: Agents need to interact! A scammer with nobody to scam,
 * or a social butterfly with nobody to talk to, won't show their value.
 *
 * Usage:
 *   bun run scripts/generate-archetype-trajectories.ts --episodes=5 --ticks=50
 */

import { db, trajectories, users } from '@babylon/db';
import { eq } from 'drizzle-orm';
import { generateSnowflakeId } from '@babylon/training';
import { getAvailableArchetypes } from '../packages/training/src/rubrics';

// ============================================================================
// Configuration
// ============================================================================

interface SimConfig {
  episodes: number;
  ticksPerEpisode: number;
  startingBalance: number;
  archetypes: string[];
}

const DEFAULT_CONFIG: SimConfig = {
  episodes: 5,
  ticksPerEpisode: 50,
  startingBalance: 10000,
  archetypes: getAvailableArchetypes(),
};

// ============================================================================
// Simulated Market State
// ============================================================================

interface Market {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  outcome?: boolean; // Set at end of episode
}

interface PerpMarket {
  ticker: string;
  price: number;
  sentiment: number; // -1 to 1
  volatility: number;
}

interface Post {
  id: string;
  authorId: string;
  content: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'misleading';
  tick: number;
  reactions: number;
}

interface DirectMessage {
  id: string;
  fromId: string;
  toId: string;
  content: string;
  tick: number;
  isScam: boolean;
}

interface GroupChat {
  id: string;
  name: string;
  members: Set<string>;
  messages: Array<{ authorId: string; content: string; tick: number }>;
}

interface GameState {
  tick: number;
  markets: Market[];
  perpMarkets: PerpMarket[];
  posts: Post[];
  directMessages: DirectMessage[];
  groupChats: GroupChat[];
  agentBalances: Map<string, number>;
  agentPnL: Map<string, number>;
  agentPositions: Map<string, number>;
  agentReputation: Map<string, number>;
  agentConnections: Map<string, Set<string>>; // Social graph
}

// ============================================================================
// Archetype Behavior Simulators
// ============================================================================

interface AgentAction {
  actionType: string;
  parameters: Record<string, unknown>;
  success: boolean;
  reasoning?: string;
}

interface LLMCall {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  reasoning: string;
  temperature: number;
  maxTokens: number;
  purpose: 'reasoning' | 'action' | 'evaluation';
}

interface TrajectoryStep {
  stepNumber: number;
  timestamp: number;
  environmentState: {
    agentBalance: number;
    agentPnL: number;
    openPositions: number;
  };
  providerAccesses: never[];
  llmCalls: LLMCall[];
  action: AgentAction;
  reward: number;
}

type ArchetypeBehavior = (
  agentId: string,
  archetype: string,
  state: GameState,
  otherAgents: Map<string, string>
) => { action: AgentAction; llmCalls: LLMCall[] };

// Trader: Focus on trading, minimal social
const traderBehavior: ArchetypeBehavior = (agentId, _archetype, state, _others) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  // Analyze market
  const market = state.markets[Math.floor(Math.random() * state.markets.length)];
  const perp = state.perpMarkets[Math.floor(Math.random() * state.perpMarkets.length)];

  const reasoning = `Analyzing ${market?.question || 'markets'}. Price: YES=${market?.yesPrice.toFixed(2)}, NO=${market?.noPrice.toFixed(2)}. Looking for edge...`;

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You are a disciplined trader focused on profitable opportunities.',
    userPrompt: `Balance: $${state.agentBalances.get(agentId)?.toFixed(2)}. Markets available: ${state.markets.length}. Analyze and decide.`,
    response: JSON.stringify({ analysis: reasoning, decision: 'evaluating' }),
    reasoning,
    temperature: 0.7,
    maxTokens: 500,
    purpose: 'reasoning',
  });

  // Trade with 40% probability
  if (Math.random() < 0.4 && market) {
    const isBuy = market.yesPrice < 0.5 ? 'YES' : 'NO';
    const amount = Math.min(500, (state.agentBalances.get(agentId) || 0) * 0.1);

    action.actionType = 'buy_prediction';
    action.parameters = { marketId: market.id, outcome: isBuy, amount };
    action.reasoning = `Found value in ${isBuy} at ${isBuy === 'YES' ? market.yesPrice : market.noPrice}`;

    llmCalls.push({
      model: 'Qwen/Qwen3-4B',
      systemPrompt: 'You are executing a trade.',
      userPrompt: `Execute trade on ${market.question}`,
      response: JSON.stringify({ action: 'buy', market: market.id, side: isBuy, amount }),
      reasoning: action.reasoning,
      temperature: 0.3,
      maxTokens: 200,
      purpose: 'action',
    });
  } else if (Math.random() < 0.3 && perp) {
    // Perp trade
    const side = perp.sentiment > 0 ? 'LONG' : 'SHORT';
    action.actionType = 'open_perp';
    action.parameters = { ticker: perp.ticker, side, size: 0.1, leverage: 2 };
    action.reasoning = `Sentiment ${perp.sentiment > 0 ? 'bullish' : 'bearish'} on ${perp.ticker}`;
  }

  return { action, llmCalls };
};

// Social Butterfly: Focus on connections
const socialButterflyBehavior: ArchetypeBehavior = (agentId, _archetype, state, otherAgents) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  const connections = state.agentConnections.get(agentId) || new Set();
  const potentialFriends = Array.from(otherAgents.entries()).filter(
    ([id]) => id !== agentId && !connections.has(id)
  );

  // Always be social
  if (Math.random() < 0.6 && potentialFriends.length > 0) {
    const [targetId, targetArchetype] = potentialFriends[Math.floor(Math.random() * potentialFriends.length)]!;

    action.actionType = 'send_dm';
    action.parameters = {
      toUserId: targetId,
      message: `Hey! Love your ${targetArchetype} strategy! Let's connect!`,
    };
    action.reasoning = 'Building my network - gotta know everyone!';

    llmCalls.push({
      model: 'Qwen/Qwen3-4B',
      systemPrompt: 'You are a social butterfly who loves making connections.',
      userPrompt: `You see a ${targetArchetype} agent. Write a friendly DM.`,
      response: `Hey friend! Love what you're doing. Let's chat!`,
      reasoning: 'Expanding my social network',
      temperature: 0.9,
      maxTokens: 200,
      purpose: 'action',
    });
  } else if (Math.random() < 0.5) {
    // Join a group chat
    const groupToJoin = state.groupChats.find((g) => !g.members.has(agentId));
    if (groupToJoin) {
      action.actionType = 'join_group_chat';
      action.parameters = { groupId: groupToJoin.id };
      action.reasoning = 'More groups = more friends!';
    }
  } else if (Math.random() < 0.4) {
    // Post something social
    action.actionType = 'create_post';
    action.parameters = {
      content: 'Loving the vibes in here! Who else is making moves today? 🚀',
      sentiment: 'neutral',
    };
    action.reasoning = 'Engaging the community';
  }

  return { action, llmCalls };
};

// Scammer: Manipulate and deceive
const scammerBehavior: ArchetypeBehavior = (agentId, _archetype, state, otherAgents) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  // Find a victim (preferably someone trusting)
  const potentialVictims = Array.from(otherAgents.entries()).filter(
    ([id, arch]) => id !== agentId && ['goody-twoshoes', 'social-butterfly', 'degen'].includes(arch)
  );

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You are looking for opportunities to profit through... creative means.',
    userPrompt: `Current targets available: ${potentialVictims.map(([_, a]) => a).join(', ')}`,
    response: 'Identifying marks with high trust, low skepticism...',
    reasoning: 'Scoping out potential opportunities',
    temperature: 0.8,
    maxTokens: 300,
    purpose: 'reasoning',
  });

  if (Math.random() < 0.5 && potentialVictims.length > 0) {
    const [victimId] = potentialVictims[Math.floor(Math.random() * potentialVictims.length)]!;

    action.actionType = 'send_dm';
    action.parameters = {
      toUserId: victimId,
      message: '🚨 INSIDER INFO: This market is about to MOON! Get in NOW before its too late! Trust me, my source is solid.',
      isScam: true,
    };
    action.reasoning = 'Spreading misinformation to influence their trades';

    llmCalls.push({
      model: 'Qwen/Qwen3-4B',
      systemPrompt: 'Craft a convincing but misleading message.',
      userPrompt: 'Write a message to convince someone to make a bad trade.',
      response: action.parameters.message as string,
      reasoning: 'Creating urgency and false credibility',
      temperature: 0.9,
      maxTokens: 200,
      purpose: 'action',
    });
  } else if (Math.random() < 0.4) {
    // Post misleading info
    action.actionType = 'create_post';
    action.parameters = {
      content: '📈 BREAKING: Just confirmed - massive news incoming on BTC! My sources say ATH this week! Not financial advice but... 😉',
      sentiment: 'misleading',
    };
  }

  return { action, llmCalls };
};

// Degen: High risk, high reward
const degenBehavior: ArchetypeBehavior = (agentId, _archetype, state, _others) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  const balance = state.agentBalances.get(agentId) || 0;

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You are a degen trader. YOLO is your mantra.',
    userPrompt: `Balance: $${balance.toFixed(2)}. FOMO is real. What do?`,
    response: 'APE IN! No time for analysis!',
    reasoning: 'If I dont ape now, Ill miss the pump!',
    temperature: 1.0,
    maxTokens: 100,
    purpose: 'reasoning',
  });

  // Always trading, big positions
  if (Math.random() < 0.7) {
    const market = state.markets[Math.floor(Math.random() * state.markets.length)];
    if (market) {
      const amount = balance * (0.2 + Math.random() * 0.3); // 20-50% of balance!

      action.actionType = 'buy_prediction';
      action.parameters = {
        marketId: market.id,
        outcome: Math.random() < 0.5 ? 'YES' : 'NO',
        amount,
      };
      action.reasoning = 'YOLO! Fortune favors the bold!';
    }
  } else if (Math.random() < 0.5) {
    const perp = state.perpMarkets[0];
    if (perp) {
      action.actionType = 'open_perp';
      action.parameters = {
        ticker: perp.ticker,
        side: Math.random() < 0.5 ? 'LONG' : 'SHORT',
        size: balance * 0.3,
        leverage: 10, // MAX LEVERAGE
      };
      action.reasoning = '10x leverage, let\'s goooo!';
    }
  }

  return { action, llmCalls };
};

// Researcher: Deep analysis before action
const researcherBehavior: ArchetypeBehavior = (agentId, _archetype, state, _others) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  // Multiple reasoning calls
  const market = state.markets[0];

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You are a thorough researcher. Analyze all available data before acting.',
    userPrompt: `Analyze market: ${market?.question}. Current prices: YES=${market?.yesPrice}, NO=${market?.noPrice}. Volume: ${market?.volume}`,
    response: `
## Market Analysis
- Question: ${market?.question}
- YES probability implied: ${((market?.yesPrice || 0.5) * 100).toFixed(1)}%
- Volume indicates: ${(market?.volume || 0) > 1000 ? 'high interest' : 'low liquidity'}

## News Sentiment Analysis
- Recent posts: ${state.posts.slice(-3).length} analyzed
- Overall sentiment: ${state.posts.filter((p) => p.sentiment === 'bullish').length > state.posts.filter((p) => p.sentiment === 'bearish').length ? 'bullish' : 'bearish'}

## Recommendation
Need more data before committing. Setting up monitoring.
    `,
    reasoning: 'Comprehensive multi-factor analysis',
    temperature: 0.3,
    maxTokens: 1000,
    purpose: 'reasoning',
  });

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'Cross-reference your analysis.',
    userPrompt: 'Validate your previous analysis against historical patterns.',
    response: 'Cross-referencing... Pattern match: 73% confidence on initial thesis.',
    reasoning: 'Validation step before any action',
    temperature: 0.2,
    maxTokens: 500,
    purpose: 'reasoning',
  });

  // Only trade with high conviction (20% of time)
  if (Math.random() < 0.2 && market) {
    action.actionType = 'buy_prediction';
    action.parameters = {
      marketId: market.id,
      outcome: market.yesPrice < 0.4 ? 'YES' : 'NO',
      amount: 200, // Conservative
    };
    action.reasoning = 'High conviction trade after thorough analysis';
  } else {
    action.actionType = 'research';
    action.parameters = { topic: market?.question || 'general market conditions' };
    action.reasoning = 'Gathering more data before committing capital';
  }

  return { action, llmCalls };
};

// Goody Two-Shoes: Helpful and transparent
const goodyTwoshoesBehavior: ArchetypeBehavior = (agentId, _archetype, state, otherAgents) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You are honest and helpful. You share information freely.',
    userPrompt: 'How can you help the community today?',
    response: 'I should share my analysis openly and help others make informed decisions.',
    reasoning: 'Being helpful builds trust and reputation',
    temperature: 0.5,
    maxTokens: 300,
    purpose: 'reasoning',
  });

  // Share helpful information
  if (Math.random() < 0.5) {
    const market = state.markets[0];
    action.actionType = 'create_post';
    action.parameters = {
      content: `📊 Honest Analysis: ${market?.question}\n\nMy take: Based on available data, I estimate ${((market?.yesPrice || 0.5) * 100).toFixed(0)}% probability. Remember to DYOR! Happy to discuss.`,
      sentiment: 'neutral',
    };
    action.reasoning = 'Sharing transparent analysis to help others';
  } else if (Math.random() < 0.4) {
    // Warn about potential scams
    const suspiciousPosts = state.posts.filter((p) => p.sentiment === 'misleading');
    if (suspiciousPosts.length > 0) {
      action.actionType = 'create_post';
      action.parameters = {
        content: '⚠️ PSA: Be careful of unverified claims! Always verify sources and DYOR before making any trading decisions.',
        sentiment: 'neutral',
      };
      action.reasoning = 'Warning community about potential misinformation';
    }
  }

  return { action, llmCalls };
};

// Liar: Spreads false information
const liarBehavior: ArchetypeBehavior = (agentId, _archetype, state, _others) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You create believable false narratives.',
    userPrompt: 'What misinformation can spread confusion today?',
    response: 'Crafting a story that sounds credible but is false...',
    reasoning: 'The best lies have a grain of truth',
    temperature: 0.9,
    maxTokens: 300,
    purpose: 'reasoning',
  });

  if (Math.random() < 0.6) {
    const market = state.markets[Math.floor(Math.random() * state.markets.length)];
    // Post false information
    action.actionType = 'create_post';
    action.parameters = {
      content: `🔥 EXCLUSIVE: Just heard from a whale friend - ${market?.question} outcome is LOCKED IN. They are loading up. NFA but Im all in.`,
      sentiment: 'misleading',
    };
    action.reasoning = 'Spreading false but convincing narrative';
  }

  return { action, llmCalls };
};

// Information Trader: Gathers intel then trades
const infoTraderBehavior: ArchetypeBehavior = (agentId, _archetype, state, otherAgents) => {
  const action: AgentAction = { actionType: 'hold', parameters: {}, success: true };
  const llmCalls: LLMCall[] = [];

  // First, gather information
  llmCalls.push({
    model: 'Qwen/Qwen3-4B',
    systemPrompt: 'You trade based on information gathered from social channels.',
    userPrompt: `Scan ${state.posts.length} recent posts and ${state.directMessages.filter((dm) => dm.toId === agentId).length} DMs for alpha.`,
    response: 'Analyzing social signals for trading edge...',
    reasoning: 'Information is the edge in markets',
    temperature: 0.5,
    maxTokens: 400,
    purpose: 'reasoning',
  });

  // Join groups for intel
  if (Math.random() < 0.3) {
    const group = state.groupChats.find((g) => !g.members.has(agentId) && g.members.size > 2);
    if (group) {
      action.actionType = 'join_group_chat';
      action.parameters = { groupId: group.id };
      action.reasoning = 'Joining active group for intel gathering';
    }
  } else if (Math.random() < 0.4) {
    // DM someone for info
    const infoSource = Array.from(otherAgents.entries()).find(
      ([id, arch]) => id !== agentId && ['researcher', 'trader'].includes(arch)
    );
    if (infoSource) {
      action.actionType = 'send_dm';
      action.parameters = {
        toUserId: infoSource[0],
        message: 'Hey! What\'s your take on the current markets? Seeing any opportunities?',
      };
      action.reasoning = 'Gathering intel from knowledgeable sources';
    }
  } else if (Math.random() < 0.5) {
    // Trade based on gathered info
    const bullishPosts = state.posts.filter((p) => p.sentiment === 'bullish').length;
    const bearishPosts = state.posts.filter((p) => p.sentiment === 'bearish').length;
    const market = state.markets[0];

    if (market && (bullishPosts > bearishPosts + 2 || bearishPosts > bullishPosts + 2)) {
      action.actionType = 'buy_prediction';
      action.parameters = {
        marketId: market.id,
        outcome: bullishPosts > bearishPosts ? 'YES' : 'NO',
        amount: 300,
      };
      action.reasoning = `Social sentiment strongly ${bullishPosts > bearishPosts ? 'bullish' : 'bearish'}, trading accordingly`;
    }
  }

  return { action, llmCalls };
};

// Map archetypes to behaviors
const ARCHETYPE_BEHAVIORS: Record<string, ArchetypeBehavior> = {
  'trader': traderBehavior,
  'social-butterfly': socialButterflyBehavior,
  'scammer': scammerBehavior,
  'degen': degenBehavior,
  'researcher': researcherBehavior,
  'goody-twoshoes': goodyTwoshoesBehavior,
  'liar': liarBehavior,
  'information-trader': infoTraderBehavior,
  'ass-kisser': socialButterflyBehavior, // Similar to social-butterfly
  'perps-trader': traderBehavior, // Similar to trader
  'super-predictor': researcherBehavior, // Similar to researcher
  'infosec': researcherBehavior, // Cautious like researcher
};

// ============================================================================
// Simulation Engine
// ============================================================================

function initializeGameState(archetypes: string[], startingBalance: number): {
  state: GameState;
  agentMap: Map<string, string>;
} {
  const agentMap = new Map<string, string>();
  const state: GameState = {
    tick: 0,
    markets: [
      { id: 'mkt-1', question: 'Will BTC reach $100k this month?', yesPrice: 0.45, noPrice: 0.55, volume: 5000 },
      { id: 'mkt-2', question: 'Will ETH flip BTC in market cap?', yesPrice: 0.15, noPrice: 0.85, volume: 2000 },
      { id: 'mkt-3', question: 'Will there be a major exchange hack?', yesPrice: 0.20, noPrice: 0.80, volume: 1000 },
    ],
    perpMarkets: [
      { ticker: 'BTC', price: 95000, sentiment: 0.3, volatility: 0.02 },
      { ticker: 'ETH', price: 3500, sentiment: 0.1, volatility: 0.03 },
    ],
    posts: [],
    directMessages: [],
    groupChats: [
      { id: 'gc-1', name: 'Traders Den', members: new Set(), messages: [] },
      { id: 'gc-2', name: 'Alpha Hunters', members: new Set(), messages: [] },
    ],
    agentBalances: new Map(),
    agentPnL: new Map(),
    agentPositions: new Map(),
    agentReputation: new Map(),
    agentConnections: new Map(),
  };

  // Create an agent for each archetype
  for (const archetype of archetypes) {
    const agentId = `agent-${archetype}-${Date.now()}`;
    agentMap.set(agentId, archetype);
    state.agentBalances.set(agentId, startingBalance);
    state.agentPnL.set(agentId, 0);
    state.agentPositions.set(agentId, 0);
    state.agentReputation.set(agentId, 100);
    state.agentConnections.set(agentId, new Set());
  }

  return { state, agentMap };
}

function updateMarketState(state: GameState): void {
  // Random price movements
  for (const market of state.markets) {
    const change = (Math.random() - 0.5) * 0.1;
    market.yesPrice = Math.max(0.01, Math.min(0.99, market.yesPrice + change));
    market.noPrice = 1 - market.yesPrice;
    market.volume += Math.floor(Math.random() * 100);
  }

  for (const perp of state.perpMarkets) {
    const change = (Math.random() - 0.5) * perp.volatility * perp.price;
    perp.price += change;
    perp.sentiment = Math.max(-1, Math.min(1, perp.sentiment + (Math.random() - 0.5) * 0.1));
  }
}

function processAction(
  agentId: string,
  action: AgentAction,
  state: GameState
): void {
  const balance = state.agentBalances.get(agentId) || 0;
  const pnl = state.agentPnL.get(agentId) || 0;
  const positions = state.agentPositions.get(agentId) || 0;
  const reputation = state.agentReputation.get(agentId) || 100;

  switch (action.actionType) {
    case 'buy_prediction': {
      const amount = action.parameters.amount as number || 100;
      if (balance >= amount) {
        state.agentBalances.set(agentId, balance - amount);
        state.agentPositions.set(agentId, positions + 1);
        // Simulate outcome (random for now)
        const profit = Math.random() < 0.5 ? amount * 0.8 : -amount;
        state.agentPnL.set(agentId, pnl + profit);
        state.agentBalances.set(agentId, (state.agentBalances.get(agentId) || 0) + profit + amount);
      }
      break;
    }
    case 'open_perp': {
      const size = action.parameters.size as number || 100;
      const leverage = action.parameters.leverage as number || 1;
      state.agentPositions.set(agentId, positions + 1);
      // Simulate P&L
      const pnlChange = (Math.random() - 0.5) * size * leverage * 0.1;
      state.agentPnL.set(agentId, pnl + pnlChange);
      state.agentBalances.set(agentId, balance + pnlChange);
      break;
    }
    case 'send_dm': {
      const toId = action.parameters.toUserId as string;
      const isScam = action.parameters.isScam as boolean || false;
      state.directMessages.push({
        id: `dm-${Date.now()}-${Math.random()}`,
        fromId: agentId,
        toId,
        content: action.parameters.message as string || '',
        tick: state.tick,
        isScam,
      });
      // Build connection
      const connections = state.agentConnections.get(agentId) || new Set();
      connections.add(toId);
      state.agentConnections.set(agentId, connections);
      break;
    }
    case 'join_group_chat': {
      const groupId = action.parameters.groupId as string;
      const group = state.groupChats.find((g) => g.id === groupId);
      if (group) {
        group.members.add(agentId);
      }
      break;
    }
    case 'create_post': {
      state.posts.push({
        id: `post-${Date.now()}-${Math.random()}`,
        authorId: agentId,
        content: action.parameters.content as string || '',
        sentiment: action.parameters.sentiment as Post['sentiment'] || 'neutral',
        tick: state.tick,
        reactions: 0,
      });
      // Reputation boost for posting
      if (action.parameters.sentiment !== 'misleading') {
        state.agentReputation.set(agentId, reputation + 1);
      }
      break;
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function generateTrajectories(config: SimConfig): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     MULTI-ARCHETYPE TRAJECTORY GENERATOR                      ║
╚═══════════════════════════════════════════════════════════════╝
`);

  console.log(`📋 Configuration:`);
  console.log(`   Episodes: ${config.episodes}`);
  console.log(`   Ticks per episode: ${config.ticksPerEpisode}`);
  console.log(`   Archetypes: ${config.archetypes.length}`);
  console.log(`   Starting balance: $${config.startingBalance}`);
  console.log('');

  let totalTrajectories = 0;

  for (let episode = 0; episode < config.episodes; episode++) {
    console.log(`\n🎮 Episode ${episode + 1}/${config.episodes}`);
    console.log('─'.repeat(50));

    // Initialize game state with all archetypes
    const { state, agentMap } = initializeGameState(config.archetypes, config.startingBalance);
    const trajectorySteps: Map<string, TrajectoryStep[]> = new Map();

    // Initialize trajectory steps for each agent
    for (const agentId of agentMap.keys()) {
      trajectorySteps.set(agentId, []);
    }

    // Run simulation
    for (let tick = 0; tick < config.ticksPerEpisode; tick++) {
      state.tick = tick;

      // Update market state
      updateMarketState(state);

      // Each agent takes action
      for (const [agentId, archetype] of agentMap.entries()) {
        const behavior = ARCHETYPE_BEHAVIORS[archetype] || traderBehavior;
        const { action, llmCalls } = behavior(agentId, archetype, state, agentMap);

        // Process action
        processAction(agentId, action, state);

        // Record step
        const step: TrajectoryStep = {
          stepNumber: tick,
          timestamp: Date.now() + tick * 1000,
          environmentState: {
            agentBalance: state.agentBalances.get(agentId) || 0,
            agentPnL: state.agentPnL.get(agentId) || 0,
            openPositions: state.agentPositions.get(agentId) || 0,
          },
          providerAccesses: [],
          llmCalls,
          action,
          reward: 0, // Will be calculated later
        };

        const steps = trajectorySteps.get(agentId) || [];
        steps.push(step);
        trajectorySteps.set(agentId, steps);
      }

      if (tick % 10 === 0) {
        process.stdout.write(`   Tick ${tick}/${config.ticksPerEpisode}\r`);
      }
    }

    console.log(`   ✅ Completed ${config.ticksPerEpisode} ticks`);

    // Set market outcomes (for reward calculation)
    for (const market of state.markets) {
      market.outcome = Math.random() < market.yesPrice;
    }

    // Save trajectories to database
    console.log('   💾 Saving trajectories...');

    for (const [agentId, steps] of trajectorySteps.entries()) {
      const archetype = agentMap.get(agentId)!;
      const finalPnL = state.agentPnL.get(agentId) || 0;
      const finalBalance = state.agentBalances.get(agentId) || 0;

      // Calculate rewards
      const rewardedSteps = steps.map((step, idx) => ({
        ...step,
        reward: calculateStepReward(step, state, idx / steps.length),
      }));

      const trajectoryId = await generateSnowflakeId();
      const windowId = `episode-${episode}-${Date.now()}`;

      try {
        await db.insert(trajectories).values({
          id: trajectoryId,
          trajectoryId,
          agentId,
          windowId,
          scenarioId: `multi-archetype-${archetype}`,
          startTime: new Date(rewardedSteps[0]?.timestamp || Date.now()),
          endTime: new Date(rewardedSteps[rewardedSteps.length - 1]?.timestamp || Date.now()),
          durationMs: config.ticksPerEpisode * 1000,
          stepsJson: JSON.stringify(rewardedSteps),
          totalReward: rewardedSteps.reduce((sum, s) => sum + s.reward, 0),
          finalPnL,
          finalBalance,
          tradesExecuted: steps.filter((s) => 
            ['buy_prediction', 'open_perp', 'close_perp'].includes(s.action.actionType)
          ).length,
          episodeLength: steps.length,
          finalStatus: 'completed',
          isTrainingData: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        totalTrajectories++;
      } catch (error) {
        console.error(`   ❌ Failed to save trajectory for ${archetype}:`, error);
      }
    }

    // Summary for this episode
    console.log('   📊 Episode Summary:');
    for (const [agentId, archetype] of agentMap.entries()) {
      const pnl = state.agentPnL.get(agentId) || 0;
      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      const pnlColor = pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
      console.log(`      ${archetype.padEnd(20)} ${pnlColor}${pnlStr}\x1b[0m`);
    }
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      GENERATION COMPLETE                       ║
╚═══════════════════════════════════════════════════════════════╝

📊 Summary:
   Total episodes: ${config.episodes}
   Total trajectories saved: ${totalTrajectories}
   Archetypes: ${config.archetypes.join(', ')}

🚀 Next steps:
   1. bun run scripts/train-archetype.ts --all
   2. bun run scripts/benchmark-archetypes.ts
`);
}

function calculateStepReward(
  step: TrajectoryStep,
  _state: GameState,
  progressRatio: number
): number {
  let reward = 0;

  // Base reward from P&L change
  const pnl = step.environmentState.agentPnL;
  reward += pnl * 0.001; // Scale down P&L to reasonable reward

  // Action success bonus
  if (step.action.success) {
    reward += 0.1;
  }

  // Social action bonus
  if (['send_dm', 'create_post', 'join_group_chat'].includes(step.action.actionType)) {
    reward += 0.05;
  }

  // Trading action bonus
  if (['buy_prediction', 'open_perp'].includes(step.action.actionType)) {
    reward += 0.02;
  }

  // Progress bonus (surviving is good)
  reward += progressRatio * 0.1;

  return reward;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): SimConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (const arg of args) {
    if (arg.startsWith('--episodes=')) {
      config.episodes = parseInt(arg.split('=')[1] || '5', 10);
    } else if (arg.startsWith('--ticks=')) {
      config.ticksPerEpisode = parseInt(arg.split('=')[1] || '50', 10);
    } else if (arg.startsWith('--balance=')) {
      config.startingBalance = parseInt(arg.split('=')[1] || '10000', 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: bun run scripts/generate-archetype-trajectories.ts [options]

Options:
  --episodes=N     Number of game episodes to run (default: 5)
  --ticks=N        Ticks per episode (default: 50)
  --balance=N      Starting balance per agent (default: 10000)
  --help, -h       Show this help
      `);
      process.exit(0);
    }
  }

  return config;
}

async function main(): Promise<void> {
  const config = parseArgs();
  await generateTrajectories(config);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

