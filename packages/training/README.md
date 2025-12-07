# Babylon Training Pipeline

> **⚠️ Experimental** - Under active development. APIs may change.

RL training for Babylon agents using trajectory-based learning.

## Quick Start

### 1. Generate Trajectories

```bash
bun run dev  # Start server first

babylon train parallel --archetypes trader --num-agents 5 --ticks 20
```

### 2. Train Locally

```bash
cd packages/training/python
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Auto-detects MLX/CUDA/CPU
python scripts/train_local.py
```

## Hardware

| Platform | Backend | Model |
|----------|---------|-------|
| Mac M1/M2 (16GB) | MLX | `mlx-community/Qwen2.5-1.5B-Instruct-4bit` |
| Mac M1/M2 (32GB+) | MLX | `mlx-community/Qwen2.5-3B-Instruct-4bit` |
| GTX 3060+ (12GB) | CUDA | `Qwen/Qwen2.5-1.5B-Instruct` |
| GTX 4090 (24GB) | CUDA | `Qwen/Qwen2.5-3B-Instruct` |
| Any | Tinker | Cloud-based |

## CLI Commands

### Generate Data

```bash
babylon train parallel --archetypes trader,degen --num-agents 3 --ticks 20
babylon train parallel -a all -n 2 -t 10      # All archetypes
babylon train parallel --dry-run               # Preview
```

| Flag | Description | Default |
|------|-------------|---------|
| `-a, --archetypes` | Comma-separated or `all` | `trader` |
| `-n, --num-agents` | Agents per archetype | `2` |
| `-t, --ticks` | Ticks per agent | `10` |
| `-p, --parallel` | Max concurrent agents | `5` |
| `--cleanup` | Delete agents after | `false` |

### Score & Export

```bash
babylon train score                           # Score all trajectories
babylon train archetype -a trader             # Score + export for archetype
babylon train archetype -a trader --score-only
```

### Train

```bash
babylon train pipeline -a trader              # Full pipeline
babylon train run -a all                      # All archetypes
```

## Python Training

### Local Training

```bash
cd packages/training/python
source venv/bin/activate

python scripts/train_local.py                 # Auto-detect backend
python scripts/train_local.py --backend mlx   # Force MLX
python scripts/train_local.py --backend cuda  # Force CUDA
```

Options:
```bash
python scripts/train_local.py \
  --backend mlx \
  --model mlx-community/Qwen2.5-1.5B-Instruct-4bit \
  --output ./trained_models/my_model \
  --iters 100 \
  --batch-size 2 \
  --lr 1e-5 \
  --min-actions 3 \
  --lookback-hours 168 \
  --max-trajectories 500 \
  --validate
```

### Cloud Training (Tinker)

```bash
export TINKER_API_KEY=your_key
export DATABASE_URL=postgresql://...
export OPENAI_API_KEY=sk-...

python scripts/run_tinker_training.py --steps 100
```

## Archetypes

| Archetype | Description |
|-----------|-------------|
| `trader` | Disciplined profit-focused trader |
| `degen` | High-risk YOLO trader |
| `scammer` | Manipulative, spreads misinformation |
| `researcher` | Analytical, data-driven |
| `social-butterfly` | Community engagement focused |
| `information-trader` | News/signal-based |
| `perps-trader` | Perpetual futures specialist |
| `super-predictor` | Prediction market expert |
| `infosec` | Security-conscious |
| `goody-twoshoes` | Helpful, ethical |
| `ass-kisser` | Follows crowd consensus |
| `liar` | Consistently misleading |

## Architecture

```
Agent Trajectories → TrajectoryRecorder → Database
                                            ↓
                                   LLM-as-Judge Scoring
                                            ↓
                                      Export JSONL
                                            ↓
                              Python Training (MLX/CUDA/Tinker)
                                            ↓
                                    Trained Model
```

### TypeScript (`src/`)

| Directory | Purpose |
|-----------|---------|
| `archetypes/` | Archetype configs |
| `generation/` | Trajectory generation |
| `training/` | Recording and export |
| `scoring/` | LLM-as-judge |
| `rubrics/` | Evaluation rubrics |
| `benchmark/` | Model benchmarking |
| `huggingface/` | HuggingFace upload |

### Python (`python/src/`)

| Directory | Purpose |
|-----------|---------|
| `data_bridge/` | Database reader |
| `training/` | Training modules |

## Environment Variables

```bash
DATABASE_URL=postgresql://...       # Required
OPENAI_API_KEY=sk-...               # For RLAIF judge
TINKER_API_KEY=your_key             # For cloud training
```

## Troubleshooting

**No trajectory data**
```bash
bun run dev
babylon train parallel --archetypes trader --num-agents 5 --ticks 20
```

**Not enough samples** - Need 20+ trajectories with LLM calls. Run more agents.

**MLX fails** - `pip install mlx mlx-lm`

**CUDA OOM** - Use smaller model or add `--lora`

**Database issues** - Check `DATABASE_URL` in `.env`, ensure PostgreSQL running

## Development

```bash
bun test packages/training
bun run typecheck
bun run packages/training/scripts/e2e-training-test.ts  # E2E validation
```
