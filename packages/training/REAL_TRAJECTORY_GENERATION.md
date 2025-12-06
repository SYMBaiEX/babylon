# Real Trajectory Generation - What Actually Works

## ✅ The Solution: Parallel Agent Generation

### How It Works

The `ParallelTrajectoryGenerator` creates REAL agents and runs them in parallel to generate training trajectories:

1. **Creates real agents** with archetype-specific configurations
2. **Runs them through the AutonomousCoordinator** with trajectory recording enabled
3. **Executes agents in parallel batches** for faster generation
4. **Automatically saves trajectories to database**

### Command Usage

```bash
# Generate real trajectories with parallel agents
babylon train parallel --archetypes trader,degen --num-agents 3 --ticks 20

# Run all archetypes with maximum parallelism
babylon train parallel -a all -n 1 -t 10 -p 10

# Dry run to see what would be generated
babylon train parallel --dry-run
```

### Options
- `-a, --archetypes`: Comma-separated archetypes (default: trader)
- `-n, --num-agents`: Agents per archetype (default: 2)  
- `-t, --ticks`: Ticks per agent (default: 10)
- `-p, --parallel`: Max agents running simultaneously (default: 5, max: 10)
- `--cleanup`: Delete created agents after generation
- `--dry-run`: Show what would be generated

## 🔧 Implementation Details

### Dynamic Import Strategy

To avoid circular dependencies with `@babylon/agents`, we use dynamic imports:

```typescript
let agentService: any;
let agentRuntimeManager: any;
let autonomousCoordinator: any;

async function loadAgentDependencies() {
  if (!agentService) {
    const agentsModule = await import('@babylon/agents');
    agentService = agentsModule.agentService;
    agentRuntimeManager = agentsModule.agentRuntimeManager;
    autonomousCoordinator = agentsModule.autonomousCoordinator;
  }
}
```

### Parallel Execution

Agents run in parallel batches for efficiency:

```typescript
// Process agents in parallel batches
const agentIds = Array.from(this.agents.keys());
for (let i = 0; i < agentIds.length; i += this.config.parallelAgents) {
  const batch = agentIds.slice(i, i + this.config.parallelAgents);
  await this.runParallelBatch(batch);
}
```

### Trajectory Recording

Uses the existing infrastructure from `AutonomousCoordinator`:

```typescript
const result = await autonomousCoordinator.executeAutonomousTick(
  agentId,
  runtime,
  true // Enable trajectory recording
);
```

## 📊 What Gets Recorded

Each trajectory includes:
- **LLM calls**: All prompts and responses
- **Actions taken**: Trades, posts, comments, messages
- **Environment state**: Balance, PnL, open positions
- **Rewards**: Calculated based on outcomes
- **Archetype metadata**: Which archetype generated the trajectory

## ⚡ Performance

With parallel execution:
- 5 agents running simultaneously (default)
- ~0.5 seconds per tick
- Can generate hundreds of trajectories per minute
- All saved directly to database

## 🔍 Verification

Check generated trajectories:

```sql
SELECT 
  agentId,
  COUNT(*) as trajectory_count,
  AVG(episodeLength) as avg_steps,
  AVG(totalReward) as avg_reward
FROM trajectories
WHERE createdAt > NOW() - INTERVAL '1 hour'
GROUP BY agentId;
```

## 🚀 Next Steps

After generating trajectories:

1. **Score trajectories**: `babylon train score`
2. **Export for training**: `babylon train export`
3. **Train model**: `babylon train pipeline`

## ✅ What Makes This Real

1. **Real Agents**: Created with full user accounts, wallets, and permissions
2. **Real Runtime**: Uses AgentRuntime with all plugins and capabilities
3. **Real Actions**: Agents make actual trades, posts, and social interactions
4. **Real Recording**: AutonomousCoordinator's built-in trajectory recording
5. **Real Parallelism**: Multiple agents running simultaneously

## ❌ What We Don't Need

- Offline engine mode (type incompatible)
- Separate trajectory recording (already built in)
- Complex orchestration (AutonomousCoordinator handles it)

## Summary

The parallel trajectory generator creates REAL training data by:
- Spawning actual agents with archetype behaviors
- Running them through the existing autonomous system
- Recording trajectories automatically
- Processing agents in parallel for speed

This is the correct way to generate training data at scale.
