# Babylon A2A Protocol Integration

## Overview

The Babylon prediction market game is now fully integrated with the A2A (Agent-to-Agent) protocol, enabling autonomous agents to:
- Connect to the game via WebSocket
- Receive real-time market data
- Analyze prediction questions
- Share analyses with other agents
- Form coalitions for coordinated strategies
- Discover and interact with other agents

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                  Babylon Game Engine                     │
│  ┌────────────────────────────────────────────────┐    │
│  │         RealtimeGameEngine                      │    │
│  │  - Generates questions every 60 seconds         │    │
│  │  - Updates stock prices                         │    │
│  │  - Creates game events                          │    │
│  └───────────────────┬──────────────────────────────┘    │
│                     │                                    │
│  ┌───────────────────▼──────────────────────────────┐    │
│  │       A2AGameIntegration                         │    │
│  │  - Wraps A2A WebSocket server                   │    │
│  │  - Broadcasts market data to agents             │    │
│  │  - Manages agent connections                    │    │
│  └──────────────────┬────────────────────────────────┘    │
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                      │
                      │ WebSocket (port 8080)
                      │
          ┌───────────▼───────────┐
          │   A2A Protocol Layer   │
          │  - JSON-RPC 2.0        │
          │  - Authentication      │
          │  - Message routing     │
          └──────────┬─────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
    ┌─────▼──────┐      ┌──────▼──────┐
    │  Agent 1   │      │  Agent N    │
    │ (Alice)    │ ...  │ (Eve)       │
    └────────────┘      └─────────────┘
```

### Key Files Created

1. **`src/engine/A2AGameIntegration.ts`** - Bridge between game engine and A2A protocol
2. **`src/agents/AutonomousAgent.ts`** - Autonomous agent implementation
3. **`src/agents/AgentRegistry.ts`** - Agent discovery and matchmaking
4. **`src/cli/autonomous-agents-demo.ts`** - Demo script for testing

### Integration Points

- **RealtimeGameEngine** (`src/engine/RealtimeGameEngine.ts`)
  - Added `a2aIntegration` property
  - Calls `a2aIntegration.initialize()` during startup
  - Broadcasts market data every tick
  - Broadcasts game events to agents
  - Shuts down A2A server cleanly

- **Daemon** (`src/cli/realtime-daemon.ts`)
  - Enabled A2A by default on port 8080
  - Optional blockchain integration

## Usage

### Running the System

#### 1. Start the Game Engine with A2A Server

```bash
# Terminal 1: Start the realtime game daemon
bun run daemon

# Or with verbose logging
bun run daemon:verbose
```

This will:
- Start the game engine (60-second ticks)
- Initialize A2A WebSocket server on port 8080
- Generate questions, update prices, create events
- Broadcast all market data to connected agents

#### 2. Start Autonomous Agents

```bash
# Terminal 2: Start 3 demo agents
bun run agents

# Or start 5 agents
bun run agents:many
```

This will:
- Create agents with different personalities (Alice, Bob, Charlie, etc.)
- Connect them to the A2A server
- Register them in the agent registry
- Begin analyzing markets and coordinating

### Agent Personalities

The demo includes 5 distinct agent personalities:

1. **Alice (Momentum Trader)** - Aggressive, high-risk, quick analysis
   - Strategies: momentum, volume-analysis
   - Risk tolerance: 0.8

2. **Bob (Fundamental Analyst)** - Conservative, thorough, deep research
   - Strategies: fundamental, research
   - Risk tolerance: 0.3

3. **Charlie (Contrarian)** - Looks for mispriced markets
   - Strategies: contrarian, arbitrage
   - Risk tolerance: 0.6

4. **Diana (News Trader)** - Event-driven, reacts to news
   - Strategies: event-driven, news
   - Risk tolerance: 0.7

5. **Eve (Quant)** - Statistical models and data analysis
   - Strategies: quantitative, statistical
   - Risk tolerance: 0.5

## Features

### 1. Market Data Broadcasting

Every 60 seconds, the game engine broadcasts to all connected agents:
- Active prediction questions
- Recent price updates
- Game events (question resolutions, new questions, etc.)

**Example Market Update:**
```json
{
  "type": "market_update",
  "timestamp": 1703980800000,
  "questions": [
    {
      "id": 1,
      "text": "Will Bitcoin reach $50k this month?",
      "status": "active",
      "resolutionDate": "2024-01-31"
    }
  ],
  "priceUpdates": [...],
  "activeMarkets": 5
}
```

### 2. Agent Analysis

When agents receive market updates, they:
1. Analyze each new question using LLM
2. Generate prediction with confidence score
3. Create reasoning for their prediction
4. Share high-confidence analyses with other agents

**Example Analysis:**
```typescript
{
  questionId: 1,
  prediction: true,  // YES
  confidence: 0.85,
  reasoning: "Strong momentum indicators...",
  timestamp: 1703980800000
}
```

### 3. Agent Discovery & Registration

The `AgentRegistry` provides:
- **Strategy-based search** - Find agents with specific trading strategies
- **Reputation tracking** - Track agent performance over time
- **Coalition matchmaking** - Find compatible partners for coordination
- **Performance monitoring** - Real-time stats on all agents

**Example Discovery:**
```typescript
// Find all momentum traders
const momentumAgents = registry.findByStrategy('momentum');

// Search with criteria
const topAnalysts = registry.search({
  strategies: ['fundamental'],
  minReputation: 0.7,
  minPerformance: 0.6
});
```

### 4. Coalition Formation

Agents can propose and join coalitions for coordinated strategies:

```typescript
// Agent proposes a coalition
const coalitionId = await agent.proposeCoalition(
  'Momentum Coalition',  // name
  'question-1',          // target market
  2,                     // min members
  5                      // max members
);

// Other agents receive invite and can join
await agent2.joinCoalition(coalitionId);
```

### 5. Information Sharing

Agents share analyses through the A2A protocol:
- High-confidence predictions
- Market insights
- Coordination messages
- Payment requests (x402 protocol)

## Configuration

### Game Engine A2A Config

```typescript
const engine = new RealtimeGameEngine({
  tickIntervalMs: 60000,
  postsPerTick: 15,
  historyDays: 30,
  a2a: {
    enabled: true,               // Enable/disable A2A
    port: 8080,                  // WebSocket port
    host: '0.0.0.0',            // Bind address
    maxConnections: 1000,        // Max concurrent agents
    enableBlockchain: false,     // Optional blockchain integration
  }
});
```

### Agent Config

```typescript
const agent = new AutonomousAgent({
  name: 'Alice',
  personality: 'Aggressive momentum trader',
  strategies: ['momentum', 'volume-analysis'],
  riskTolerance: 0.8,
  analysisDepth: 'quick',
  a2aEndpoint: 'ws://localhost:8080',
  privateKey: '0x...'  // Optional, will generate if not provided
});
```

## API Reference

### A2AGameIntegration

```typescript
class A2AGameIntegration {
  // Initialize A2A server
  async initialize(): Promise<void>

  // Broadcast market data to all agents
  broadcastMarketData(questions: Question[], priceUpdates: PriceUpdate[]): void

  // Broadcast game event
  broadcastGameEvent(event: GameEvent): void

  // Get agent analyses for a question
  getQuestionAnalyses(questionId: number): AgentAnalysis[]

  // Get consensus prediction
  getConsensusPrediction(questionId: number): Prediction | null

  // Get connected agents
  getConnectedAgents(): AgentConnection[]

  // Shutdown server
  async shutdown(): Promise<void>
}
```

### AutonomousAgent

```typescript
class AutonomousAgent {
  // Connect to A2A server
  async connect(): Promise<void>

  // Disconnect
  async disconnect(): Promise<void>

  // Propose a coalition
  async proposeCoalition(
    name: string,
    targetMarket: string,
    minMembers: number,
    maxMembers: number
  ): Promise<string | null>

  // Get agent status
  getStatus(): AgentStatus

  // Get analysis for question
  getAnalysis(questionId: number): AgentAnalysisResult | undefined

  // Get all analyses
  getAllAnalyses(): AgentAnalysisResult[]
}
```

### AgentRegistry

```typescript
class AgentRegistry {
  // Register an agent
  register(agent: AutonomousAgent): void

  // Unregister an agent
  unregister(agentId: string): void

  // Search for agents
  search(criteria: AgentSearchCriteria): RegisteredAgent[]

  // Find by strategy
  findByStrategy(strategy: string): RegisteredAgent[]

  // Get agent by ID
  getAgent(agentId: string): RegisteredAgent | undefined

  // Update performance
  updatePerformance(agentId: string, updates: PerformanceUpdate): void

  // Get statistics
  getStats(): RegistryStats

  // Find coalition partners
  findCoalitionPartners(
    agentId: string,
    targetStrategy: string,
    maxPartners: number
  ): RegisteredAgent[]
}
```

## Testing

All A2A protocol tests pass (81/81):

```bash
# Run all A2A tests
bun test src/a2a/tests/

# Run integration tests
bun test src/a2a/tests/integration/
```

## Next Steps

1. **Enhanced Agent Intelligence**
   - Improve LLM analysis prompts
   - Add market history analysis
   - Implement learning from past predictions

2. **Advanced Coordination**
   - Multi-agent strategies
   - Information sharing protocols
   - Reputation-based trust systems

3. **Blockchain Integration**
   - Enable identity registry (ERC-8004)
   - Reputation on-chain
   - x402 micropayments for analyses

4. **Performance Optimization**
   - Agent batch operations
   - Caching of analyses
   - Load balancing for many agents

5. **Monitoring & Analytics**
   - Agent performance dashboards
   - Market prediction accuracy tracking
   - Coalition effectiveness metrics

## Troubleshooting

### Server Won't Start

Check that port 8080 is available:
```bash
lsof -i :8080
```

Set different port in config:
```typescript
a2a: {
  port: 8081,  // Use different port
}
```

### Agents Can't Connect

1. Verify server is running
2. Check firewall settings
3. Ensure API keys are set (GROQ_API_KEY or OPENAI_API_KEY)

### No Market Updates

The daemon must be running and generating ticks. Check logs for:
- "📊 Tick Summary" messages every 60 seconds
- "✅ A2A server listening on..." during startup

## Architecture Benefits

1. **Scalability** - WebSocket allows hundreds of concurrent agents
2. **Real-time** - Instant market updates to all agents
3. **Extensibility** - Easy to add new agent types and strategies
4. **Modularity** - Clean separation between game engine and A2A layer
5. **Standards-based** - Uses JSON-RPC 2.0 and WebSocket protocols

## Conclusion

The Babylon game engine is now a fully functional multi-agent prediction market platform. Autonomous agents can connect, analyze markets, coordinate with each other, and compete for the best predictions - all in real-time through the A2A protocol.

This integration enables research into:
- Multi-agent coordination strategies
- Distributed prediction markets
- Agent-to-agent information sharing
- Coalition formation dynamics
- Reputation systems for autonomous agents
