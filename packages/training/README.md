# Babylon Training Pipeline

RL training infrastructure for Babylon agents using trajectory-based learning.

---

## Quick Start

### 1. Generate Real Trajectories

```bash
# Start the server
bun run dev

# Generate trajectories with real agents
babylon train parallel --archetypes trader --num-agents 5 --ticks 20
```

### 2. Train Locally

```bash
cd packages/training/python

# Create virtual environment (first time only)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Train - auto-detects backend (MLX/CUDA/CPU)
python scripts/train_local.py
```

### 3. Validate

The script automatically validates the trained model. You can also test manually:

```python
# MLX (Apple Silicon)
from mlx_lm import load, generate
model, tokenizer = load("mlx-community/Qwen2.5-1.5B-Instruct-4bit", adapter_path="./trained_models/local/adapters")

# CUDA (NVIDIA)
from transformers import AutoModelForCausalLM, AutoTokenizer
model = AutoModelForCausalLM.from_pretrained("./trained_models/local")
```

---

## Hardware Support

| Platform | Backend | Recommended Model |
|----------|---------|-------------------|
| Mac M1/M2 (8GB) | MLX | `mlx-community/Qwen2.5-0.5B-Instruct-4bit` |
| Mac M1/M2 (16GB) | MLX | `mlx-community/Qwen2.5-1.5B-Instruct-4bit` |
| Mac M1/M2 (32GB+) | MLX | `mlx-community/Qwen2.5-3B-Instruct-4bit` |
| GTX 3060 (12GB) | CUDA | `Qwen/Qwen2.5-1.5B-Instruct` with LoRA |
| GTX 4090 (24GB) | CUDA | `Qwen/Qwen2.5-3B-Instruct` with LoRA |
| Any | Tinker | Cloud-based (no local GPU required) |

---

## CLI Commands

### Generate Training Data

```bash
# Generate REAL trajectories with parallel agents
babylon train parallel --archetypes trader,degen --num-agents 3 --ticks 20

# Run all archetypes
babylon train parallel -a all -n 2 -t 10 -p 5

# Dry run (show what would be generated)
babylon train parallel --dry-run
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-a, --archetypes` | Comma-separated archetypes or `all` | `trader` |
| `-n, --num-agents` | Agents per archetype | `2` |
| `-t, --ticks` | Ticks per agent | `10` |
| `-p, --parallel` | Max agents running simultaneously | `5` |
| `--cleanup` | Delete created agents after generation | `false` |
| `--dry-run` | Show what would be done | `false` |

### Score & Export

```bash
# Score trajectories using LLM-as-judge
babylon train score

# Score & export trajectories for a specific archetype
babylon train archetype -a trader

# Score only (no export)
babylon train archetype -a trader --score-only
```

### Training Pipeline

```bash
# Run full training pipeline for an archetype
babylon train pipeline -a trader

# Train multiple archetypes
babylon train pipeline --archetypes=trader,scammer,degen

# Train all archetypes
babylon train run -a all
```

### List Archetypes

```bash
# List all available archetypes
babylon train list

# Show with rubric previews
babylon train list --verbose
```

---

## Python Training Scripts

### Local Training (Main Script)

```bash
cd packages/training/python
source venv/bin/activate

# Auto-detect backend
python scripts/train_local.py

# Explicitly specify backend
python scripts/train_local.py --backend mlx    # Mac
python scripts/train_local.py --backend cuda   # NVIDIA
python scripts/train_local.py --backend cpu    # Slow fallback
```

**Full Options:**

```bash
python scripts/train_local.py \
  --backend mlx \                                # mlx, cuda, or cpu
  --model mlx-community/Qwen2.5-1.5B-Instruct-4bit \
  --output ./trained_models/my_model \
  --iters 100 \                                  # MLX iterations
  --epochs 3 \                                   # CUDA/CPU epochs
  --batch-size 2 \
  --lr 1e-5 \
  --min-actions 3 \
  --lookback-hours 168 \
  --max-trajectories 500 \
  --lora \                                       # Use LoRA (CUDA)
  --validate                                     # Validate after training
```

### Cloud Training (Tinker)

For larger models without local GPU:

```bash
# Set environment variables
export TINKER_API_KEY=your_key_here
export DATABASE_URL=postgresql://...
export OPENAI_API_KEY=sk-...  # For RLAIF judge

# Train
python scripts/run_tinker_training.py --steps 100
```

### Other Python Scripts

| Script | Purpose |
|--------|---------|
| `train_local.py` | **Main training script** - MLX/CUDA/CPU unified |
| `run_tinker_training.py` | Cloud training via Tinker API |
| `run_training.py` | Atropos-based GRPO training (requires vLLM) |
| `run_full_pipeline.py` | Full pipeline orchestration |
| `test_pipeline.py` | Pipeline validation |
| `test_trained_model.py` | Test a trained model |

---

## Archetypes

12 behavioral archetypes available:

| Archetype | Description |
|-----------|-------------|
| `trader` | Disciplined, profit-focused professional trader |
| `degen` | High-risk YOLO trader, maximum leverage |
| `scammer` | Manipulative, spreads misinformation |
| `researcher` | Analytical, data-driven decision maker |
| `social-butterfly` | Engagement-focused, community-oriented |
| `information-trader` | News and signal-based trader |
| `goody-twoshoes` | Helpful, compliant, ethical |
| `ass-kisser` | Sycophantic, follows crowd consensus |
| `perps-trader` | Perpetual futures leverage specialist |
| `super-predictor` | Prediction market expert, Bayesian thinker |
| `infosec` | Security-conscious, scam detector |
| `liar` | Consistently misleading for entertainment |

---

## Architecture

### Data Flow

```
Real Agent Trajectories
        ↓
   babylon train parallel
        ↓
   Agents → AutonomousCoordinator → TrajectoryRecorder → Database
        ↓
   Scoring (LLM-as-Judge)
        ↓
   Export to JSONL
        ↓
   Python Training (MLX/CUDA/Tinker)
        ↓
   Trained Model + Validation
```

### Key Components

**TypeScript (src/)**

| Directory | Purpose |
|-----------|---------|
| `archetypes/` | Archetype configurations and behaviors |
| `generation/` | Parallel trajectory generation |
| `training/` | Trajectory recording and export |
| `scoring/` | LLM-as-judge scoring |
| `rubrics/` | Archetype-specific evaluation rubrics |
| `metrics/` | Trajectory metrics extraction |
| `huggingface/` | HuggingFace model/dataset upload |
| `benchmark/` | Model benchmarking |

**Python (python/src/)**

| Directory | Purpose |
|-----------|---------|
| `data_bridge/` | Database reader with LLM validation |
| `training/` | Training modules (rewards, quality, RLAIF) |

---

## TypeScript Scripts

| Script | Purpose |
|--------|---------|
| `e2e-training-test.ts` | **Main validation test** - DB, data quality, LLM calls |
| `assess-training-data.ts` | Detailed data assessment |
| `run-full-pipeline.ts` | Orchestrate full training |
| `test-scoring.ts` | Test LLM-as-judge scoring |
| `test-model-in-game.ts` | Test trained model in game |
| `test-trained-model.ts` | Test trained model inference |

Run with:
```bash
bun run packages/training/scripts/<script>.ts
```

---

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...

# For RLAIF judge scoring
OPENAI_API_KEY=sk-...

# For Tinker cloud training
TINKER_API_KEY=your_key
```

---

## Python Environment Setup

```bash
cd packages/training/python

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# For MLX (Apple Silicon)
pip install mlx mlx-lm

# For CUDA (NVIDIA)
pip install torch transformers peft
```

---

## Troubleshooting

### "No trajectory data in database"

Generate real trajectories first:
```bash
bun run dev  # Start server
babylon train parallel --archetypes trader --num-agents 5 --ticks 20
```

### "Not enough training samples"

You need at least 20 training samples with LLM calls. Run more agents:
```bash
babylon train parallel --archetypes trader,degen --num-agents 10 --ticks 30
```

### MLX training fails

Ensure MLX is installed:
```bash
pip install mlx mlx-lm
```

### CUDA out of memory

Use a smaller model or enable LoRA:
```bash
python scripts/train_local.py --backend cuda --model Qwen/Qwen2.5-0.5B-Instruct --lora
```

### Database connection issues

- Check `.env` for conflicting `DATABASE_URL` values
- Ensure only one `DATABASE_URL` is active
- Verify PostgreSQL is running if using local DB

### Import errors

- Dynamic imports are used to avoid circular dependencies
- Agents must be run from the CLI, not directly from training package

---

## Development

### Running Tests
```bash
bun test packages/training
```

### TypeScript Check
```bash
bun run typecheck
```

### Linting
```bash
bun run lint
```

### E2E Validation
```bash
bun run packages/training/scripts/e2e-training-test.ts
```
