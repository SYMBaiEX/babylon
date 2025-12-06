# Babylon Training Pipeline - Production Status

## ✅ Production-Ready Components

### 1. Trajectory Recording System
**Location**: `packages/agents/src/autonomous/AutonomousCoordinator.ts`

The trajectory recording is built into agents:
```typescript
trajId = await trajectoryRecorder.startTrajectory({
  agentId: agentUserId,
  metadata: { tickType: 'autonomous', startTime },
});
```

**How it works**:
- Agents automatically record EVERY action when running autonomously
- Includes LLM calls, environment state, actions taken, rewards
- Automatically saves to PostgreSQL database
- Integrated with training package (`@babylon/training`)

### 2. Parallel Agent Generation
**Command**: `babylon train parallel`

Creates real agents and runs them through the AutonomousCoordinator:
```bash
# Start server first
bun run dev

# Then in another terminal
babylon train parallel --archetypes trader,degen --num-agents 2 --ticks 10
```

### 3. Archetype Definitions
**Location**: `packages/training/src/archetypes/ArchetypeConfigService.ts`

12 complete archetype configurations with:
- Personality traits and behaviors
- Trading strategies and risk preferences
- Social behaviors and engagement patterns
- Action weights and position sizing

### 4. LLM-as-Judge Scoring
**Location**: `packages/training/src/scoring/ArchetypeScoringService.ts`

Scores trajectories using archetype-specific rubrics:
```bash
babylon train score
```

### 5. Python Training Pipeline
**Location**: `packages/training/python/`

Two training modes:
- **Atropos**: Local training with vLLM (requires GPU)
- **Tinker API**: Cloud-based training (recommended)

### 6. Synthetic Data Protection
**Location**: `packages/training/src/utils/synthetic-detector.ts`

Automatic detection and rejection of synthetic/fake data:
- Blocks `agent-trader-123` style IDs
- Blocks `synthetic-*`, `fake-*`, `test-agent-*` patterns
- Only real production data enters training pipeline

## ⚠️ Prerequisites

### Required:
1. **PostgreSQL Database** - Neon cloud or local
2. **LLM API Key** - OpenAI, Anthropic, or compatible
3. **Running Server** - For A2A and agent coordination

### For Training:
4. **Tinker API Key** - For cloud training
5. **OR Local GPU + vLLM** - For Atropos training

## 📋 How to Generate Production Training Data

### Step 1: Start the Server
```bash
bun run dev
```

### Step 2: Generate Real Trajectories
```bash
babylon train parallel --archetypes trader,degen --num-agents 3 --ticks 20
```

### Step 3: Score Trajectories
```bash
babylon train score
```

### Step 4: Export and Train
```bash
babylon train archetype -a trader
cd packages/training/python
python scripts/run_full_pipeline.py --mode full
```

## 🚫 NOT Supported

| Feature | Why Removed |
|---------|-------------|
| Synthetic Data Training | Fake data doesn't teach real behaviors |
| Offline Engine Mode | Use real agents with server |
| Mock LLM Scoring | LLM-as-judge is required for quality |

## 📊 Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Trajectory Recording | ✅ | Built into AutonomousCoordinator |
| Parallel Agent Generation | ✅ | Requires server running |
| Archetype Definitions | ✅ | 12 complete archetypes with rubrics |
| LLM-as-Judge Scoring | ✅ | Archetype-specific evaluation |
| Python Training | ✅ | GRPO with Atropos or Tinker |
| Synthetic Data Detection | ✅ | Auto-rejected from training |
| HuggingFace Integration | ✅ | Dataset and model uploading |
| Benchmarking | ✅ | Pre/post training comparison |

**Production Use**: Start server with `bun run dev`, then use `babylon train parallel` to generate real training data.
