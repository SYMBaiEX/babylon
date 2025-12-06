# Training Data Generation

This directory contains components for generating real training data from agent interactions.

## Overview

The training package generates **real** trajectory data by:
1. Creating actual agents with archetype-specific configurations
2. Running them through the autonomous coordination system
3. Recording their decisions, actions, and outcomes
4. Storing trajectories for RL training

## Quick Start

```typescript
import { initializeTrainingPackage, ParallelTrajectoryGenerator } from '@babylon/training';

// Step 1: Initialize dependencies (required before using generators)
await initializeTrainingPackage();

// Step 2: Create and run the generator
const generator = new ParallelTrajectoryGenerator({
  archetypes: ['trader', 'social-butterfly', 'researcher'],
  agentsPerArchetype: 2,
  ticksPerAgent: 20,
  parallelAgents: 5,
  recordTrajectories: true,
  managerId: 'your-user-id',
});

const result = await generator.generate();
console.log(`Generated ${result.trajectoryIds.length} trajectories`);

// Step 3: Cleanup (optional)
await generator.cleanup();
```

## CLI Usage

```bash
# Generate real trajectories (requires running server)
babylon train parallel --archetypes trader,researcher --num-agents 2 --ticks 20

# Score trajectories with LLM-as-judge
babylon train score

# Export for training
babylon train export
```

## Components

### ParallelTrajectoryGenerator

Creates real agents and runs them in parallel using the `AutonomousCoordinator` with trajectory recording enabled.

**Key Features:**
- Uses dependency injection for clean package boundaries
- Runs multiple agents in parallel (configurable batch size)
- Records complete trajectory data including LLM calls
- Applies archetype-specific autonomous settings

### MultiModelOrchestrator

Manages multiple quantized models for archetype-specific inference:
- LRU caching with VRAM-aware eviction
- 4-bit quantization support for 16GB GPUs
- vLLM integration with Groq fallback
- Batch inference for efficiency

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VLLM_BASE_URL` | vLLM server URL | `http://localhost:9001` |
| `GROQ_API_KEY` | Groq API key for fallback | - |
| `USE_REAL_INFERENCE` | Use real model inference in benchmarks | `false` |

### Archetype Settings

Each archetype has specific settings applied:
- `autonomousTrading`: Based on trade action weight
- `autonomousPosting`: Based on post frequency
- `autonomousCommenting`: Based on engagement style
- `a2aEnabled`: Disabled during training (false)

## Data Flow

```
1. Create agents with archetype configs
   ↓
2. Run autonomous ticks with recording
   ↓
3. TrajectoryRecorder saves to database
   ↓
4. LLM-as-judge scores trajectories
   ↓
5. Export for Python training pipeline
```

## Testing

Run the E2E test to verify the pipeline:

```bash
bun run packages/training/scripts/e2e-training-test.ts
```

## Important Notes

1. **Real Data Only**: This generator creates REAL data from actual agent interactions.
   Synthetic data generation has been removed.

2. **Server Required**: The parallel generator requires the web server to be running
   for A2A communication (or use database-only mode).

3. **Dependencies**: Call `initializeTrainingPackage()` before using generators.
   This sets up the required service dependencies.

4. **VRAM Management**: The MultiModelOrchestrator automatically manages VRAM
   by evicting least-recently-used models when loading new ones.
