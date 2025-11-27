# Babylon RL Training

Complete RL training pipeline for Babylon trading agents using **Atropos** (RLAIF framework by Nous Research).

---

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Configure
export DATABASE_URL=postgresql://your-db-url

# Start the Atropos API server (in terminal 1)
run-api

# Start the Babylon RLAIF environment (in terminal 2)
python -m src.training.babylon_env serve --slurm false

# Start the trainer (in terminal 3)
python -m src.training.atropos_trainer --model Qwen/Qwen2.5-3B-Instruct --steps 100
```

---

## Architecture

The training pipeline uses three components:

1. **Atropos API Server** (`run-api`): Coordinates batches between environment and trainer
2. **Babylon RLAIF Environment** (`babylon_env.py`): Loads trajectories, scores with LLM judge
3. **GRPO Trainer** (`atropos_trainer.py`): Trains the model using Group Relative Policy Optimization

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   PostgreSQL    │────▶│  Babylon RLAIF   │────▶│  Atropos API    │
│   Trajectories  │     │   Environment    │     │    Server       │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                               │                          │
                               │ LLM Judge               │ Batches
                               ▼                          ▼
                        ┌──────────────┐          ┌─────────────────┐
                        │  GPT-4o-mini │          │   GRPO Trainer  │
                        │   (RLAIF)    │          │   + vLLM        │
                        └──────────────┘          └─────────────────┘
```

---

## Environment Configuration

### Using YAML Config

```bash
python -m src.training.babylon_env serve --config config/babylon_atropos.yaml
```

### Using CLI Arguments

```bash
python -m src.training.babylon_env serve \
  --env--tokenizer_name Qwen/Qwen2.5-3B-Instruct \
  --env--group_size 4 \
  --env--max_token_length 4096 \
  --env--database_url $DATABASE_URL \
  --openai--model_name Qwen/Qwen2.5-3B-Instruct \
  --openai--base_url http://localhost:9001/v1 \
  --slurm false
```

### Key Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `group_size` | 4 | Trajectories compared per GRPO group |
| `max_token_length` | 4096 | Maximum sequence length |
| `lookback_hours` | 72 | Hours to look back for trajectories |
| `min_agents_per_window` | 2 | Minimum agents required per window |
| `judge_model` | gpt-4o-mini | LLM model for RLAIF scoring |

---

## Trainer Configuration

```bash
python -m src.training.atropos_trainer \
  --model Qwen/Qwen2.5-3B-Instruct \
  --steps 100 \
  --batch-size 4 \
  --lr 1e-5 \
  --save-path ./trained_models \
  --api-url http://localhost:8000 \
  --vllm-port 9001
```

| Option | Default | Description |
|--------|---------|-------------|
| `--model` | Qwen/Qwen2.5-3B-Instruct | Model to train |
| `--steps` | 100 | Training steps |
| `--batch-size` | 4 | Batch size |
| `--lr` | 1e-5 | Learning rate |
| `--vllm-port` | 9001 | vLLM inference server port |

---

## Supported Models

### Recommended for Training

| Model | VRAM | Notes |
|-------|------|-------|
| `Qwen/Qwen2.5-3B-Instruct` | ~8GB | Fast, good quality |
| `Qwen/Qwen2.5-7B-Instruct` | ~16GB | Better quality |
| `Qwen/Qwen2.5-14B-Instruct` | ~32GB | Best quality |

### For Apple Silicon (MLX)

| Model | RAM | Notes |
|-------|-----|-------|
| `mlx-community/Qwen2.5-3B-Instruct-4bit` | ~4GB | Fast |
| `mlx-community/Qwen2.5-7B-Instruct-4bit` | ~8GB | Good balance |

---

## Files

### Core Training Files

- `src/training/babylon_env.py` - RLAIF environment for Atropos
- `src/training/atropos_trainer.py` - GRPO trainer
- `src/training/rewards.py` - Reward functions
- `config/babylon_atropos.yaml` - Default configuration

### Data Bridge

- `src/data_bridge/reader.py` - PostgreSQL trajectory reader
- `src/data_bridge/converter.py` - Trajectory format conversion

---

## Monitoring

Training metrics can be logged to any monitoring service:

- `train/loss` - GRPO loss
- `train/pos_logp` - Log probability of positive examples
- `train/neg_logp` - Log probability of negative examples
- `train/judgement_samples` - Sample LLM judge outputs

### Local Debugging

```bash
# View rollouts in browser
view-run

# Generate offline data
python -m src.training.babylon_env process \
  --env--data_path_to_save_groups output/rollouts.jsonl \
  --env--total_steps 10
```

---

## RLAIF Scoring

The environment uses an LLM judge to score trajectories:

1. **Group Formation**: Trajectories grouped by window/scenario
2. **Context Injection**: P&L, episode length, actions provided to judge
3. **Relative Comparison**: Judge compares trajectories within group
4. **Score Normalization**: Scores normalized to mean 0 for GRPO

### Custom Scoring Rubric

Edit the `scoring_rubric` in your config:

```yaml
env:
  scoring_rubric: |
    You are evaluating trading agent performance.
    
    Score from 0.0 to 1.0 based on:
    - Profitability (50%)
    - Risk management (30%)  
    - Decision quality (20%)
    
    Compare trajectories RELATIVE to each other.
```

---

## Troubleshooting

### No trajectories found

```bash
# Check database connection
python -c "import asyncpg; print('asyncpg OK')"

# Verify trajectories exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM trajectories WHERE \"stepsJson\" IS NOT NULL"
```

### vLLM not starting

```bash
# Check GPU availability
python -c "import torch; print(torch.cuda.is_available())"

# Check vLLM installation
python -c "import vllm; print(vllm.__version__)"
```

### Environment not connecting to API

```bash
# Verify API server is running
curl http://localhost:8000/

# Check registration
curl http://localhost:8000/status
```

---

## License

MIT - See project root LICENSE file.
