# RunPod Complete Training Guide

> **Context**: This guide is for running the Babylon RL training pipeline on a 2x L40 RunPod instance (96GB VRAM total). It covers everything from installation to Phase 4 cloud validation.

**Hardware**: 2x NVIDIA L40 (48GB each, 96GB total)  
**Target Model**: Qwen2.5-14B → Qwen2.5-32B  
**Estimated Time**: 2-4 hours for full validation

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Generate Training Data](#2-generate-training-data)
3. [Tier 1: Unit Tests](#3-tier-1-unit-tests)
4. [Tier 2: JSON Mode Tests](#4-tier-2-json-mode-tests)
5. [Tier 3: Database Tests](#5-tier-3-database-tests)
6. [Tier 4: GPU Training](#6-tier-4-gpu-training)
7. [Phase 4: Cloud Validation](#7-phase-4-cloud-validation)
8. [Troubleshooting](#8-troubleshooting)

**Key Documentation Files**:
- `packages/training/TRAINING_ROADMAP.md` - Full training roadmap
- `packages/training/docs/VALIDATION_MASTERPLAN.md` - Detailed tier validation steps
- `packages/training/Makefile` - All available make targets

---

## 1. Initial Setup

### 1.1 SSH into RunPod

```bash
ssh root@<your-runpod-ip>
```

### 1.2 Verify GPU Access

```bash
nvidia-smi
```

Expected output: 2x L40 GPUs with 48GB each.

### 1.3 Clone Repository

```bash
cd /workspace
git clone <your-repo-url> babs
cd babs
```

### 1.4 Run Automated Setup

```bash
cd packages/training
bash scripts/runpod_setup.sh
```

This script:
- Installs Python 3.11 and dependencies
- Creates virtual environment
- Installs vLLM, atroposlib, wandb
- Attempts flash-attention installation
- Verifies CUDA/PyTorch setup

### 1.5 Activate Environment

```bash
cd /workspace/babs/packages/training
source python/venv/bin/activate
```

### 1.6 Verify Installation

```bash
python -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA: {torch.cuda.is_available()}')
print(f'GPUs: {torch.cuda.device_count()}')
for i in range(torch.cuda.device_count()):
    print(f'  GPU {i}: {torch.cuda.get_device_name(i)}')
"
```

---

## 2. Generate Training Data

We need trajectories in the database before training. Two options:

### Option A: Use Synthetic Data (Quick - 5 min)

The simulation bridge generates synthetic scenarios automatically. Skip to Tier 1.

### Option B: Generate Real Trajectories (Thorough - 30+ min)

```bash
# Install bun if not present
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Navigate to engine
cd /workspace/babs/packages/engine

# Install dependencies
bun install

# Generate 2 hours of training data (adjust as needed)
bun run examples/generate-training-data.ts --hours 2 --npcs 20

# Check output
ls -la ../../training-data-output/trajectories/
```

### Import to Database

```bash
cd /workspace/babs/packages/training

# Start database containers
make db-up
make db-migrate

# Import trajectories
cd python
PYTHONPATH=. python scripts/import_json_trajectories.py \
  --input ../../training-data-output/trajectories/ \
  --verbose
```

---

## 3. Tier 1: Unit Tests

Tests all Python modules without infrastructure.

```bash
cd /workspace/babs/packages/training
source python/venv/bin/activate
make tier1
```

**Expected**: ~534 tests pass in ~25 seconds.

**If failures occur**:
```bash
# Run with verbose output
cd python && PYTHONPATH=. pytest tests/ -v --tb=long
```

---

## 4. Tier 2: JSON Mode Tests

Tests JSON parsing and format validation.

```bash
make tier2
```

**Expected**: All JSON mode tests pass.

---

## 5. Tier 3: Database Tests

Tests database connectivity and trajectory loading.

### 5.1 Start Database

```bash
make db-up
make db-migrate

# Verify database is running
docker ps
```

### 5.2 Run Database Tests

```bash
make tier3
```

**Expected**: Database connection works, trajectory loading works.

---

## 6. Tier 4: GPU Training

Full end-to-end training test with GPU.

### 6.1 Quick Validation (Single GPU, Small Model)

```bash
# Start with small model to verify pipeline works
make train PROFILE=48gb STEPS=20
```

**Expected**:
- vLLM starts and loads Qwen2.5-7B
- Atropos API starts
- Environment starts collecting trajectories
- Training runs for 20 steps
- Model checkpoint saved

### 6.2 Check Logs

```bash
# Training progress
tail -f python/logs/training.log

# vLLM server
cat python/logs/services/vllm.log

# Environment
cat python/logs/environment.log
```

### 6.3 Verify Output

```bash
ls -la python/trained_models/
```

---

## 7. Phase 4: Cloud Validation

Now we validate the cloud-specific features with 2x L40 GPUs.

### 7.1 Safe 2-GPU Test (14B Model)

```bash
# Use the safe profile first (less likely to OOM)
make train PROFILE=l40-2gpu-safe STEPS=50
```

**Profile Details** (`config/profiles/l40-2gpu-safe.json`):
- Model: Qwen2.5-14B-Instruct
- Tensor Parallel: 2 GPUs
- VRAM: ~60GB (safe margin)

### 7.2 Full 2-GPU Test (32B Model)

If 14B works, try the full 32B:

```bash
make train PROFILE=l40-2gpu STEPS=50
```

**Profile Details** (`config/profiles/l40-2gpu.json`):
- Model: Qwen2.5-32B-Instruct
- Tensor Parallel: 2 GPUs
- VRAM: ~90GB (aggressive)

### 7.3 W&B Integration Test

```bash
# Set your W&B API key
export WANDB_API_KEY=<your-wandb-key>

# Run with W&B logging
make train-cloud PROFILE=l40-2gpu-safe STEPS=100

# Check W&B dashboard at: https://wandb.ai/<your-org>/babylon-training
```

### 7.4 Online Training Test

Test the simulation bridge integration:

```bash
# Terminal 1: Start simulation bridge
cd /workspace/babs/packages/engine
bun run src/services/simulation-bridge-server.ts

# Terminal 2: Run online training
cd /workspace/babs/packages/training
source python/venv/bin/activate
make train-online PROFILE=l40-2gpu-safe STEPS=50
```

### 7.5 A/B Testing

Compare trained model against baseline:

```bash
# After training completes
make ab-test-quick

# Or with specific models
make ab-test \
  MODEL_A=Qwen/Qwen2.5-14B-Instruct \
  MODEL_B=./python/trained_models/final_model \
  AB_RUNS=3
```

### 7.6 Docker Build Test

```bash
make docker-build
```

---

## 8. Troubleshooting

### OOM (Out of Memory) Errors

```bash
# Use smaller profile
make train PROFILE=48gb STEPS=20

# Or reduce batch size manually
# Edit python/config/profiles/l40-2gpu-safe.json
# Change "batch_size": 4 to "batch_size": 2
```

### vLLM Won't Start

```bash
# Check CUDA
nvidia-smi

# Check vLLM logs
cat python/logs/services/vllm.log

# Try manual start
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-7B-Instruct \
  --port 9001 \
  --gpu-memory-utilization 0.4
```

### Database Connection Issues

```bash
# Restart database
make db-reset

# Check containers
docker ps
docker logs babylon-test-postgres
```

### Training Stuck at "Waiting for batch"

```bash
# Check environment logs
cat python/logs/environment.log

# Check if trajectories exist
cd python && PYTHONPATH=. python -c "
from src.training.database import get_trajectory_count
print(f'Trajectories: {get_trajectory_count()}')
"
```

### Import Errors

```bash
# Reinstall dependencies
cd python
pip install -r requirements.txt
pip install vllm atroposlib wandb
```

---

## Quick Reference

### Available Profiles

| Profile | Model | GPUs | VRAM | Use Case |
|---------|-------|------|------|----------|
| `12gb` | Qwen2.5-0.5B | 1 | 3GB | Local dev |
| `48gb` | Qwen2.5-7B | 1 | 30GB | Single L40 |
| `l40` | Qwen2.5-14B | 1 | 40GB | Single L40 prod |
| `l40-2gpu-safe` | Qwen2.5-14B | 2 | 60GB | 2x L40 safe |
| `l40-2gpu` | Qwen2.5-32B | 2 | 90GB | 2x L40 aggressive |
| `l40-4gpu` | Qwen3-30B | 4 | 180GB | 4x L40 production |

### Key Make Targets

```bash
# Testing
make tier1          # Unit tests
make tier2          # JSON tests  
make tier3          # Database tests
make tier4          # GPU training test

# Training
make train PROFILE=<profile> STEPS=<n>
make train-cloud PROFILE=<profile>    # With W&B
make train-online PROFILE=<profile>   # With bridge

# Infrastructure
make db-up          # Start database
make db-migrate     # Apply schema
make bridge-server  # Start simulation bridge

# Utilities
make help           # Show all targets
make clean          # Clean outputs
```

### Success Criteria

- [ ] `runpod_setup.sh` completes without errors
- [ ] `nvidia-smi` shows 2x L40 GPUs
- [ ] Tier 1 tests pass (534+ tests)
- [ ] Tier 2 tests pass
- [ ] Tier 3 tests pass (database)
- [ ] Tier 4 training runs (48gb profile)
- [ ] 2-GPU training works (l40-2gpu-safe profile)
- [ ] W&B logging works
- [ ] Online training works
- [ ] A/B testing runs

---

## Files to Reference

- **Makefile**: `packages/training/Makefile`
- **Setup Script**: `packages/training/scripts/runpod_setup.sh`
- **Validation Script**: `packages/training/scripts/runpod_validate.sh`
- **Profiles**: `packages/training/python/config/profiles/*.json`
- **Full Roadmap**: `packages/training/TRAINING_ROADMAP.md`
- **Validation Plan**: `packages/training/docs/VALIDATION_MASTERPLAN.md`

---

*Last updated: Phase 4 implementation complete. Ready for cloud validation.*



