# Babylon RL Training

Complete RL training pipeline for Babylon trading agents using **Tinker** (cloud-based training by Thinking Machines) or **Atropos** (local training by Nous Research).

---

## Quick Start (Tinker - Recommended)

Tinker provides cloud-based training with no local GPU required:

```bash
# Install dependencies
pip install -r requirements.txt

# Configure (get Tinker API key from Thinking Machines)
export TINKER_API_KEY=your_tinker_api_key
export DATABASE_URL=postgresql://your-db-url
export OPENAI_API_KEY=sk-...  # For RLAIF judge

# Run training
python scripts/run_tinker_training.py --steps 100
```

### Tinker Benefits

| Feature | Local (Atropos) | Cloud (Tinker) |
|---------|-----------------|----------------|
| GPU Required | Yes (vLLM) | No |
| Model Access | Local only | Up to Qwen3-235B |
| Setup Complexity | High | Low |
| Weight Sync | vLLM restart | Instant |
| Cost Model | GPU time | API calls |

---

## Quick Start (Local Atropos - Fallback)

For local GPU training:

```bash
# Install with local training deps
pip install -r requirements.txt
pip install torch transformers peft vllm

# Configure
export DATABASE_URL=postgresql://your-db-url

# Start the Atropos API server (terminal 1)
run-api

# Start the Babylon RLAIF environment (terminal 2)
python -m src.training.babylon_env serve --slurm false

# Start the trainer (terminal 3)
python -m src.training.atropos_trainer --model Qwen/Qwen2.5-3B-Instruct --steps 100
```

---

## Architecture

### Tinker Architecture (Cloud)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   PostgreSQL    │────▶│  Tinker Trainer  │────▶│   Tinker API    │
│   Trajectories  │     │   (Local CPU)    │     │    (Cloud)      │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                               │                          │
                               │ RLAIF Judge              │ Training
                               ▼                          ▼
                        ┌──────────────┐          ┌─────────────────┐
                        │  GPT-4o-mini │          │  Qwen3-30B+     │
                        │    (OpenAI)  │          │   (Tinker)      │
                        └──────────────┘          └─────────────────┘
```

### Atropos Architecture (Local)

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

## Tinker Training Configuration

### Using CLI

```bash
python scripts/run_tinker_training.py \
  --model Qwen/Qwen3-30B-A3B-Instruct \
  --steps 100 \
  --group-size 4 \
  --lr 4e-5 \
  --lora-rank 32 \
  --weight-sync-interval 5
```

### Using Python API

```python
from src.training import BabylonTinkerTrainer, TinkerTrainingConfig

config = TinkerTrainingConfig(
    base_model="Qwen/Qwen3-30B-A3B-Instruct",
    training_steps=100,
    learning_rate=4e-5,
    group_size=4,
    lora_rank=32,
)

trainer = BabylonTinkerTrainer(config)
result = await trainer.train()
```

### Using YAML Config

```bash
# Edit config/tinker_training.yaml, then:
python scripts/run_tinker_training.py --config config/tinker_training.yaml
```

### Tinker Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `base_model` | Qwen/Qwen3-30B-A3B-Instruct | Model to fine-tune |
| `lora_rank` | 32 | LoRA rank (higher = more capacity) |
| `learning_rate` | 4e-5 | Learning rate |
| `training_steps` | 100 | Number of training steps |
| `group_size` | 4 | Trajectories per GRPO comparison |
| `weight_sync_interval` | 5 | Steps between weight syncs |

---

## Atropos Training Configuration (Local)

### Using CLI

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

### Atropos Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--model` | Qwen/Qwen2.5-3B-Instruct | Model to train |
| `--steps` | 100 | Training steps |
| `--batch-size` | 4 | Batch size |
| `--lr` | 1e-5 | Learning rate |
| `--vllm-port` | 9001 | vLLM inference server port |

---

## Supported Models

### Tinker (Cloud)

| Model | Notes |
|-------|-------|
| `Qwen/Qwen3-30B-A3B-Instruct` | **Recommended** - Good balance |
| `Qwen/Qwen3-235B-A22B-Instruct` | Largest, best quality |
| `meta-llama/Llama-3.1-70B` | Alternative |
| `meta-llama/Llama-3.1-8B-Instruct` | Smaller, faster |

### Local (Atropos)

| Model | VRAM | Notes |
|-------|------|-------|
| `unsloth/Qwen3-4B-128K` | ~10GB | Default - 128K context |
| `Qwen/Qwen2.5-3B-Instruct` | ~8GB | Fast, good quality |
| `Qwen/Qwen2.5-7B-Instruct` | ~16GB | Better quality |

### Apple Silicon (MLX)

| Model | RAM | Notes |
|-------|-----|-------|
| `mlx-community/Qwen2.5-3B-Instruct-4bit` | ~4GB | Fast |
| `mlx-community/Qwen2.5-7B-Instruct-4bit` | ~8GB | Good balance |

---

## Files

### Tinker Training (Recommended)

- `src/training/tinker_client.py` - Tinker API wrapper
- `src/training/tinker_trainer.py` - GRPO trainer using Tinker
- `scripts/run_tinker_training.py` - CLI training script
- `config/tinker_training.yaml` - Training configuration

### Atropos Training (Local)

- `src/training/babylon_env.py` - RLAIF environment
- `src/training/atropos_trainer.py` - Local GRPO trainer
- `config/babylon_atropos.yaml` - Local configuration

### Shared

- `src/training/rewards.py` - Reward functions
- `src/training/quality_utils.py` - Quality scoring
- `src/data_bridge/reader.py` - PostgreSQL trajectory reader
- `src/data_bridge/converter.py` - Trajectory format conversion

---

## Environment Variables

### Required

```bash
# For RLAIF scoring (both Tinker and Atropos)
export OPENAI_API_KEY=sk-...

# Database connection
export DATABASE_URL=postgresql://...
```

### Tinker-Specific

```bash
# Tinker API key (get from Thinking Machines)
export TINKER_API_KEY=your_key_here
```

### Atropos-Specific

```bash
# Atropos API server URL
export ATROPOS_API_URL=http://localhost:8000

# vLLM inference port
export VLLM_PORT=9001
```

---

## RLAIF Scoring

Both trainers use an LLM judge to score trajectories:

1. **Group Formation**: Trajectories grouped by window/scenario
2. **Context Injection**: P&L, episode length, actions provided to judge
3. **Relative Comparison**: Judge compares trajectories within group
4. **Score Normalization**: Scores normalized to mean 0 for GRPO

### Custom Scoring Rubric

Edit `scoring_rubric` in your config:

```yaml
judge:
  rubric: |
    Score each trading trajectory from 0.0 to 1.0 based on:
    - Profitability (50%)
    - Risk management (30%)  
    - Decision quality (20%)
    
    Compare trajectories RELATIVE to each other.
```

---

## Troubleshooting

### Tinker Issues

```bash
# Check Tinker API key
python -c "import os; print('TINKER_API_KEY' in os.environ)"

# Test Tinker connection
python -c "from src.training.tinker_client import TINKER_AVAILABLE; print(f'Tinker: {TINKER_AVAILABLE}')"

# Dry run (check env without training)
python scripts/run_tinker_training.py --dry-run
```

### Atropos Issues

```bash
# Check vLLM
python -c "import torch; print(torch.cuda.is_available())"
python -c "import vllm; print(vllm.__version__)"

# Verify API server
curl http://localhost:8000/
```

### Database Issues

```bash
# Check connection
python -c "import asyncpg; print('asyncpg OK')"

# Verify trajectories exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM trajectories WHERE \"stepsJson\" IS NOT NULL"
```

---

## Monitoring

Training metrics logged to `logs/tinker_training_metrics.jsonl`:

- `loss` - GRPO loss
- `num_samples` - Samples per step
- `logprobs_mean` - Average log probability
- `pos_advantage_mean` - Positive advantage mean
- `neg_advantage_mean` - Negative advantage mean
- `avg_score` - Average RLAIF score

---

## License

MIT - See project root LICENSE file.
