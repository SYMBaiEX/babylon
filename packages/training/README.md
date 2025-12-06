# Babylon Training Pipeline

RL training infrastructure for Babylon agents using trajectory-based learning.

## Current Status

### ✅ Working Components
- **Trajectory Recording**: Built into agents via AutonomousCoordinator
- **Parallel Agent Generation**: Create and run multiple agents simultaneously
- **Archetype Definitions**: 12 complete behavioral configurations with rubrics
- **LLM-as-Judge Scoring**: Archetype-specific rubric-based evaluation
- **Python Training Pipeline**: GRPO training with Atropos or Tinker API
- **Synthetic Data Detection**: Automatic rejection of fake/test data from training

### ⚠️ Prerequisites
- **Database**: PostgreSQL required (Neon cloud or local)
- **Redis**: Optional but recommended
- **LLM API Key**: Required for scoring (OpenAI, Anthropic, or compatible)
- **Tinker API Key**: Required for cloud training (or local vLLM for Atropos)

### 🚫 NOT Supported
- **Synthetic Data Training**: Synthetic data is automatically detected and rejected
- **Training without LLM API**: LLM-as-judge scoring is required

## Quick Start

### 1. Generate Real Training Data

```bash
# Generate trajectories with parallel agents
babylon train parallel --archetypes trader,degen --num-agents 3 --ticks 20

# Run all archetypes
babylon train parallel -a all -n 2 -t 10 -p 5
```

### 2. Score Trajectories

```bash
# Score using LLM-as-judge
babylon train score
```

### 3. Export Training Data

```bash
# Export for specific archetype
babylon train archetype -a trader
```

### 4. Train Model

```bash
cd packages/training/python
python scripts/run_full_pipeline.py --mode full --no-wandb
```

## Available Commands

| Command | Description |
|---------|------------|
| `babylon train parallel` | Generate REAL trajectories with parallel agents |
| `babylon train score` | Score trajectories using LLM-as-judge |
| `babylon train archetype` | Export training data for archetype |
| `babylon train pipeline` | Run full Python training pipeline |
| `babylon train list` | List available archetypes |
| `babylon train e2e-test` | Run end-to-end pipeline validation |

## Archetypes

12 behavioral archetypes available:
- **trader**: Disciplined, profit-focused
- **degen**: High-risk, momentum trader
- **scammer**: Manipulative, misleading
- **social-butterfly**: Engagement-focused
- **researcher**: Analytical, data-driven
- **information-trader**: News and signal based
- **goody-twoshoes**: Helpful, compliant
- **ass-kisser**: Sycophantic, conformist
- **perps-trader**: Leverage specialist
- **super-predictor**: Prediction market expert
- **infosec**: Security-conscious
- **liar**: Consistently misleading

## Architecture

### Data Flow
```
Agents → AutonomousCoordinator → TrajectoryRecorder → Database
                ↓
        Parallel Execution
                ↓
        Scoring (RULER/LLM)
                ↓
        Export to JSON/JSONL
                ↓
        Python Training (GRPO/Tinker)
```

### Key Components

1. **TrajectoryRecorder** (`src/training/TrajectoryRecorder.ts`)
   - Records agent actions, LLM calls, and rewards
   - Already integrated into AutonomousCoordinator

2. **ParallelTrajectoryGenerator** (`src/generation/ParallelTrajectoryGenerator.ts`)
   - Creates real agents with archetype configs
   - Runs agents in parallel batches
   - Uses dynamic imports to avoid circular dependencies

3. **ArchetypeConfigService** (`src/archetypes/ArchetypeConfigService.ts`)
   - Defines behavioral traits and strategies
   - Configures agent personalities and trading styles

4. **Python Training** (`python/src/training/`)
   - Reward functions and scoring
   - Model training with HuggingFace integration
   - Fast simulator for benchmarking

## Database Setup

Ensure your `.env` has the correct database URL:

```bash
# Use cloud database (recommended)
DATABASE_URL="postgresql://neondb_owner:..."

# OR local database (comment out if using cloud)
# DATABASE_URL="postgresql://babylon:password@localhost:5433/babylon"
```

## Python Environment

```bash
cd packages/training/python
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

## Troubleshooting

### Database Connection Issues
- Check `.env` for conflicting DATABASE_URLs
- Ensure only one DATABASE_URL is active
- Verify PostgreSQL is running if using local DB

### Import Errors
- Dynamic imports are used to avoid circular dependencies
- Agents must be run from the CLI, not directly from training package

### Trajectory Not Recording
- Ensure `recordTrajectories=true` when calling AutonomousCoordinator
- Check database connection is working
- Verify agent has autonomous features enabled

## Development

### Running Tests
```bash
bun test packages/training
```

### TypeScript Check
```bash
cd packages/training
bun run typecheck
```

### Linting
```bash
cd packages/training
bun run lint
```

## See Also

- [ACTUAL_STATUS.md](./ACTUAL_STATUS.md) - Detailed status of what works/doesn't
- [REAL_TRAJECTORY_GENERATION.md](./REAL_TRAJECTORY_GENERATION.md) - How parallel generation works
- [generation/README.md](./src/generation/README.md) - Trajectory recording details
