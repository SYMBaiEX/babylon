# Training Data Sources

## ✅ Production Training Data

The training pipeline **only** accepts real trajectory data from running agents.
Synthetic data is automatically detected and rejected.

### How to Generate Real Training Data

#### Option 1: Parallel Agent Generation (Recommended)

```bash
# Terminal 1: Start the server
bun run dev

# Terminal 2: Generate real trajectories
babylon train parallel --archetypes trader,degen --num-agents 3 --ticks 20
```

This creates:
- Real agents with database records and wallets
- Real LLM calls via AutonomousCoordinator
- Real trajectory recording to PostgreSQL

#### Option 2: Production Agent Recording

When agents run in production with `recordTrajectories=true`:

```typescript
// In AutonomousCoordinator
const result = await autonomousCoordinator.executeAutonomousTick(
  agentId,
  runtime,
  true // Enable trajectory recording
);
```

This captures real agent behavior from production environments.

## 🛡️ Synthetic Data Protection

The pipeline automatically rejects:
- Agent IDs matching `agent-trader-123` patterns
- Agent IDs with `synthetic-*`, `fake-*`, `test-agent-*` prefixes  
- Scenario IDs with `multi-archetype`, `synthetic-*`, `test-*` prefixes

**TypeScript**: `packages/training/src/utils/synthetic-detector.ts`
**Python**: `packages/training/python/src/data_bridge/reader.py`

## How to Verify Your Data is Real

Run the e2e test:

```bash
bun run packages/training/scripts/e2e-training-test.ts
```

Real data should show:
- Agent IDs matching actual users in the database
- No synthetic patterns detected
- Valid LLM calls with real responses

## Cleaning Old Synthetic Data

If your database has old synthetic data from before this protection was added:

```sql
DELETE FROM trajectories 
WHERE "scenarioId" LIKE 'multi-archetype%' 
   OR "agentId" LIKE 'agent-%-[0-9]%'
   OR "agentId" LIKE 'synthetic-%'
   OR "agentId" LIKE 'fake-%'
   OR "agentId" LIKE 'test-agent-%';
```

## Summary

| Source | Command | Real? | Accepted for Training? |
|--------|---------|-------|------------------------|
| `babylon train parallel` | Real agents | ✅ | ✅ Yes |
| Production agents | Real behavior | ✅ | ✅ Yes |
| Synthetic generators | Fake data | ❌ | ❌ Auto-rejected |

**The pipeline enforces real data only. Synthetic data cannot enter the training process.**
