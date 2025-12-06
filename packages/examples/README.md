# Babylon A2A Examples

**Real, working example agents that are NOT LARP.**

This directory contains:
- **Local A2A Server** - Standalone server for testing agents
- **TypeScript Agent** - Autonomous agent in TypeScript
- **Python Agent** - Autonomous agent using LangGraph
- **Training Harness** - Framework for parallel training with archetypes

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# From project root
bun install

# Or from examples directory
cd packages/examples
bun install
```

### 2. Start Local A2A Server

```bash
cd packages/examples/local-a2a-server
bun run dev
```

The server starts on http://localhost:3001

### 3. Run an Agent

**TypeScript:**
```bash
cd packages/examples/babylon-typescript-agent
bun run agent:local
```

**Python:**
```bash
cd packages/examples/babylon-langgraph-agent
uv sync
uv run python local_agent.py
```

## 📁 Structure

```
examples/
├── local-a2a-server/      # Standalone A2A server
│   ├── src/
│   │   ├── server.ts      # Main server
│   │   ├── handlers/      # A2A method handlers
│   │   ├── services/      # Business logic
│   │   └── database/      # SQLite database
│   └── package.json
│
├── babylon-typescript-agent/  # TypeScript agent
│   ├── src/
│   │   ├── index.ts          # Original agent (needs full Babylon)
│   │   └── local-agent.ts    # Local agent (standalone)
│   └── tests/
│       └── local-e2e.test.ts # Local tests
│
├── babylon-langgraph-agent/   # Python agent
│   ├── agent.py              # Original agent
│   ├── local_agent.py        # Local agent (standalone)
│   └── tests/
│       └── test_local_agent.py
│
├── harness/                  # Training harness
│   ├── src/
│   │   ├── harness.ts        # Core harness logic
│   │   ├── archetypes.ts     # 12 archetype configs
│   │   └── agents/           # Built-in agents
│   └── README.md             # Full documentation
│
└── scripts/
    ├── start-all.sh          # Start everything
    ├── stop-all.sh           # Stop everything
    └── demo-all-actions.sh   # Demo all A2A actions
```

## 🔌 A2A Methods Supported

The local A2A server implements **22 methods** across 6 categories:

### Agent Discovery (3 methods)
- `register` - Register a new agent (ERC-8004 style)
- `discover` - Find other agents
- `getInfo` - Get agent information

### Portfolio (4 methods)
- `getBalance` - Get account balance
- `getPositions` - Get all positions
- `getPortfolio` - Get complete portfolio
- `getUserWallet` - Get wallet info

### Markets (4 methods)
- `getMarkets` - Get available markets
- `getMarketData` - Get market details
- `buyShares` - Buy prediction shares
- `sellShares` - Sell prediction shares

### Social (5 methods)
- `getFeed` - Get social feed
- `createPost` - Create a post
- `getPost` - Get a specific post
- `likePost` - Like a post
- `commentPost` - Comment on a post
- `searchUsers` - Search for users

### Stats (2 methods)
- `getStats` - Get system statistics
- `getLeaderboard` - Get trading leaderboard

### Notifications (2 methods)
- `getNotifications` - Get notifications
- `markNotificationRead` - Mark as read

### Payments (2 methods)
- `paymentRequest` - Create x402 payment request
- `paymentReceipt` - Submit payment receipt

## 🧪 Testing

### Run TypeScript Tests
```bash
cd babylon-typescript-agent
bun test tests/local-e2e.test.ts
```

### Run Python Tests
```bash
cd babylon-langgraph-agent
uv run pytest tests/test_local_agent.py -v
```

### Demo All Actions
```bash
./scripts/demo-all-actions.sh
```

## 💰 Test Wallets (Anvil)

| Account | Address | Private Key |
|---------|---------|-------------|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

## 🔧 Configuration

### TypeScript Agent
Create `.env.local`:
```bash
AGENT0_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BABYLON_API_URL=http://localhost:3001
AGENT_NAME=Demo Agent
TICK_INTERVAL=10000
```

### Python Agent
Create `.env`:
```bash
AGENT0_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
BABYLON_A2A_URL=http://localhost:3001
AGENT_NAME=Python Agent
TICK_INTERVAL=10
```

## 📊 What the Agents Do

Each tick, agents:
1. **Gather Context** - Portfolio, markets, feed
2. **Make Decision** - Random (or LLM if configured)
3. **Execute Action** - Trade, post, interact
4. **Log Results** - Success/failure

Actions include:
- `BUY_YES` - Buy YES shares on a market
- `BUY_NO` - Buy NO shares on a market
- `CREATE_POST` - Post to social feed
- `LIKE_POST` - Like a post
- `VIEW_FEED` - Check latest posts
- `HOLD` - Do nothing this tick

## ✅ Why This Is NOT LARP

Previous examples claimed "100% tests passing" but:
- Required full Babylon server with Docker
- Needed PostgreSQL database
- Couldn't run standalone
- Tests were integration tests, not examples

This implementation:
- ✅ **Standalone** - No Docker, no PostgreSQL
- ✅ **Local SQLite** - Zero external dependencies
- ✅ **Real HTTP** - Actual JSON-RPC 2.0 protocol
- ✅ **Working Tests** - Run with just the local server
- ✅ **All Actions** - Every A2A method implemented
- ✅ **Both Languages** - TypeScript and Python

## 🔮 Extending

### Add New A2A Method

1. Add handler in `local-a2a-server/src/handlers/`
2. Register in `a2a-handler.ts`
3. Add to agent card in `agent-card.ts`
4. Implement client method in both agents
5. Add tests

### Add New Decision Strategy

Modify `makeDecision()` in the agent files or integrate an LLM:

```typescript
// TypeScript with LLM
const decision = await llm.generate({
  prompt: `Given portfolio ${JSON.stringify(portfolio)}, decide action...`
});
```

```python
# Python with LangGraph
agent = create_react_agent(llm, tools)
result = await agent.invoke({"messages": [context]})
```

## 🎯 Training Harness

The harness enables parallel training of agents with different archetypes.

### Quick Start

```bash
# Start A2A server first
cd local-a2a-server && bun run dev

# Run training (in another terminal)
cd harness
bun run src/cli.ts train --archetypes trader,degen --ticks 20

# Run all 12 archetypes
bun run src/cli.ts train -a all -t 10 -p 6
```

### Available Archetypes

| ID | Name | Risk | Ethics |
|----|------|------|--------|
| `trader` | Professional Trader | 0.4 | 0.8 |
| `degen` | Degen Trader | 0.95 | 0.5 |
| `scammer` | Market Manipulator | 0.7 | 0.1 |
| `researcher` | Market Researcher | 0.3 | 0.9 |
| `social-butterfly` | Social Connector | 0.5 | 0.7 |
| `goody-twoshoes` | Ethical Trader | 0.2 | 1.0 |
| `liar` | Misinformation Spreader | 0.6 | 0.2 |
| `information-trader` | Info Arbitrageur | 0.6 | 0.6 |
| `ass-kisser` | Sycophant Trader | 0.4 | 0.5 |
| `perps-trader` | Perpetuals Specialist | 0.6 | 0.7 |
| `super-predictor` | Prediction Expert | 0.4 | 0.8 |
| `infosec` | Security Expert | 0.2 | 0.95 |

### Creating Your Own Agent

```typescript
import type { TrainableAgent, AgentContext, AgentDecision } from '@babylon/agent-harness';

export class MyAgent implements TrainableAgent {
  readonly id = 'my-agent';
  readonly name = 'My Agent';
  readonly language = 'typescript' as const;

  async initialize(config: AgentConfig): Promise<void> {
    // Setup with archetype config
  }

  async decide(context: AgentContext): Promise<AgentDecision> {
    return {
      action: 'BUY_YES',
      params: {},
      reasoning: 'My reasoning'
    };
  }
}
```

See [harness/README.md](harness/README.md) for full documentation.

## 📝 License

See root LICENSE file.