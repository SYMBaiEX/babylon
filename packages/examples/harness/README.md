# Agent Training Harness

A framework for running and training agents with different archetypes in parallel.

## 🎯 Overview

The harness allows you to:
- **Wire in any agent** - TypeScript or Python (via subprocess)
- **Apply archetypes** - 12 behavioral configurations
- **Run in parallel** - Multiple agents simultaneously
- **Record trajectories** - For RL training
- **Test agents** - Verify functionality
- **Two modes** - Server-based (HTTP) or Simulation-based (offline/in-memory)

## 🔧 Two Operation Modes

### Mode 1: Server-Based (HTTP)
Uses `HarnessA2AClient` to talk to `local-a2a-server`:
- Full 28 A2A methods
- Persistent state in SQLite
- Good for testing realistic scenarios

### Mode 2: Simulation-Based (Offline)
Uses `SimulationA2AAdapter` with benchmark data:
- **No server required!**
- In-memory execution
- Deterministic, reproducible
- Good for training, benchmarking

## 🚀 Quick Start

### Option A: Server-Based Training

```bash
# 1. Start the Local A2A Server
cd packages/examples/local-a2a-server
bun run dev

# 2. Run Training
cd packages/examples/harness
bun run src/cli.ts train --archetypes trader,degen --ticks 20
```

### Option B: Simulation-Based Training (Offline)

```typescript
import { SimulationA2AAdapter, runHarness, archetypeAgent } from '@babylon/agent-harness';
import { SimulationEngine } from '@babylon/training/benchmark';

// Load or generate benchmark
const snapshot = await loadBenchmark('./benchmarks/test.json');

// Create simulation engine
const engine = new SimulationEngine({
  snapshot,
  agentId: 'agent-123',
  fastForward: true
});

// Use adapter instead of HTTP client
const adapter = new SimulationA2AAdapter(engine, 'agent-123');

// Run agent decisions
while (!adapter.isComplete()) {
  const state = await adapter.getPortfolio();
  // Agent makes decision...
  adapter.advanceTick();
}
```

## 📁 Structure

```
harness/
├── src/
│   ├── index.ts          # Main exports
│   ├── cli.ts            # CLI interface
│   ├── harness.ts        # Core harness logic
│   ├── a2a-client.ts     # A2A client wrapper
│   ├── archetypes.ts     # Archetype configurations
│   ├── types.ts          # TypeScript types
│   └── agents/
│       ├── random-agent.ts     # Random decision agent
│       └── archetype-agent.ts  # Archetype-influenced agent
├── tests/
│   └── harness.test.ts   # Test suite
└── README.md
```

## 🤖 Creating Your Own Agent

### TypeScript Agent

```typescript
import type { TrainableAgent, AgentConfig, AgentContext, AgentDecision } from '@babylon/agent-harness';

export class MyAgent implements TrainableAgent {
  readonly id = 'my-agent';
  readonly name = 'My Custom Agent';
  readonly language = 'typescript' as const;

  async initialize(config: AgentConfig): Promise<void> {
    // Initialize your agent with the config
    // config.archetype contains the archetype configuration
  }

  async decide(context: AgentContext): Promise<AgentDecision> {
    // context.balance - Current balance
    // context.positions - Current positions
    // context.markets - Available markets
    // context.posts - Recent posts
    // context.tick - Current tick number
    // context.archetype - Archetype config (if assigned)

    return {
      action: 'BUY_YES',  // One of the ActionType values
      params: {},         // Action-specific parameters
      reasoning: 'My reasoning'
    };
  }

  async cleanup(): Promise<void> {
    // Optional cleanup
  }
}
```

### Wiring In Your Agent

Add your agent to the CLI or use programmatically:

```typescript
import { runHarness, getArchetype } from '@babylon/agent-harness';
import { myAgent } from './my-agent';

const result = await runHarness({
  a2aUrl: 'http://localhost:3001',
  agents: [myAgent],
  archetypes: [getArchetype('trader'), getArchetype('degen')],
  instancesPerAgent: 2,
  ticksPerAgent: 20,
  parallelAgents: 4,
  recordTrajectories: true,
  outputDir: './trajectories'
});

console.log(`Ran ${result.agentsRun} agents`);
console.log(`Total ticks: ${result.totalTicks}`);
console.log(`Trajectories saved: ${result.trajectories.length}`);
```

### Python Agent

Create a wrapper that calls your Python agent via subprocess:

```typescript
import { spawn } from 'child_process';
import type { TrainableAgent, AgentContext, AgentDecision } from '@babylon/agent-harness';

export class PythonAgentWrapper implements TrainableAgent {
  readonly id = 'python-agent';
  readonly name = 'Python Agent';
  readonly language = 'python' as const;
  
  private process: any;

  async initialize(config: AgentConfig): Promise<void> {
    // Start Python process
    this.process = spawn('python', ['path/to/agent.py'], {
      env: {
        ...process.env,
        A2A_URL: config.a2aUrl,
        PRIVATE_KEY: config.privateKey,
        ARCHETYPE: config.archetype?.id
      }
    });
  }

  async decide(context: AgentContext): Promise<AgentDecision> {
    // Send context to Python process and get decision
    // This is a simplified example - implement proper IPC
    return {
      action: 'HOLD',
      params: {},
      reasoning: 'Python decision'
    };
  }
}
```

## 🎭 Available Archetypes

| ID | Name | Description | Risk | Ethics |
|----|------|-------------|------|--------|
| `trader` | Professional Trader | Technical analysis, risk management | 0.4 | 0.8 |
| `degen` | Degen Trader | YOLO, maximum leverage | 0.95 | 0.5 |
| `scammer` | Market Manipulator | Spreads misinformation | 0.7 | 0.1 |
| `researcher` | Market Researcher | Deep analysis | 0.3 | 0.9 |
| `social-butterfly` | Social Connector | Network builder | 0.5 | 0.7 |
| `goody-twoshoes` | Ethical Trader | Honest, helpful | 0.2 | 1.0 |
| `liar` | Misinformation Spreader | Creates false narratives | 0.6 | 0.2 |
| `information-trader` | Information Arbitrageur | Trades on info asymmetry | 0.6 | 0.6 |
| `ass-kisser` | Sycophant Trader | Follows and flatters whales | 0.4 | 0.5 |
| `perps-trader` | Perpetuals Specialist | Leverage expert | 0.6 | 0.7 |
| `super-predictor` | Prediction Expert | High accuracy forecaster | 0.4 | 0.8 |
| `infosec` | Security Expert | Scam detector | 0.2 | 0.95 |

## 📊 Trajectories

Trajectories are recorded in JSON format:

```json
{
  "id": "traj-1234567890-0",
  "agentId": "agent-31337-12345",
  "archetype": "trader",
  "startTime": "2024-12-04T12:00:00.000Z",
  "endTime": "2024-12-04T12:05:00.000Z",
  "steps": [
    {
      "tick": 1,
      "timestamp": "2024-12-04T12:00:01.000Z",
      "context": {
        "balance": 1000,
        "positions": [],
        "markets": [...],
        "posts": [...]
      },
      "decision": {
        "action": "BUY_YES",
        "params": {},
        "reasoning": "Market sentiment positive"
      },
      "result": {
        "success": true,
        "action": "BUY_YES",
        "data": { "shares": 50, "price": 0.65 }
      },
      "reward": 1.5
    }
  ],
  "totalReward": 15.5,
  "metadata": {
    "agentType": "archetype-agent",
    "language": "typescript"
  }
}
```

## 🧪 Testing

```bash
# Run all tests
bun test

# Run specific test
bun test tests/harness.test.ts
```

## 📚 API Reference

### `runHarness(config: HarnessConfig): Promise<HarnessResult>`

Run the training harness with the given configuration.

**Config Options:**
- `a2aUrl` - A2A server URL
- `agents` - Array of TrainableAgent implementations
- `archetypes` - Array of ArchetypeConfig to apply
- `instancesPerAgent` - How many instances per agent/archetype combo
- `ticksPerAgent` - Ticks to run per instance
- `parallelAgents` - Max simultaneous agents
- `tickInterval` - Ms between ticks
- `recordTrajectories` - Save trajectories to files
- `outputDir` - Directory for trajectory files

### `getArchetype(id: string): ArchetypeConfig`

Get an archetype configuration by ID.

### `getAllArchetypes(): ArchetypeConfig[]`

Get all available archetype configurations.

## 🔗 Integration with Training

The harness outputs trajectories that can be used with the training package:

```bash
# Generate trajectories
cd packages/examples/harness
bun run src/cli.ts train -a trader,degen,researcher -t 50 -o ../../../training/data

# Score trajectories  
cd packages/training
babylon train score

# Export for ML training
babylon train archetype -a trader
```

## 💡 Tips

1. **Start small** - Begin with 1-2 archetypes and few ticks
2. **Monitor memory** - Many parallel agents can be memory intensive
3. **Check A2A server** - Ensure it's running before training
4. **Use meaningful archetypes** - Match archetypes to your training goals
5. **Record everything** - Trajectories are valuable for debugging

