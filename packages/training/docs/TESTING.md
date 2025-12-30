# Training Pipeline Testing Guide

> **Zero to Hero:** Complete guide for testing the Babylon training pipeline locally and in the cloud.

---

## Table of Contents

1. [Quick Start (Makefile)](#quick-start-makefile)
2. [GPU Profiles](#gpu-profiles)
3. [Testing Tiers](#testing-tiers)
4. [Manual Setup](#manual-setup)
   - [Tier 1: Unit Tests](#tier-1-no-infrastructure)
   - [Tier 2: JSON Mode](#tier-2-json-mode)
   - [Tier 3: DB Integration](#tier-3-docker-infrastructure)
   - [Tier 4: Full Stack](#tier-4-full-local-stack)
5. [Cloud Testing](#cloud-testing)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start (Makefile)

The easiest way to run tests is via the Makefile:

```bash
cd packages/training

# Show all available commands
make help

# Run tests by tier
make tier1          # Python unit tests (~30s, no infra)
make tier2          # JSON mode tests (~1min)
make tier3          # DB integration tests (~2min, starts Docker)
make tier4          # Full GPU training (~10min, requires GPU)

# Infrastructure management
make db-up          # Start test PostgreSQL + Redis
make db-down        # Stop and remove containers
make db-migrate     # Apply database schema
make db-reset       # Full reset (down + up + migrate)

# Training with GPU profiles
make train-12gb     # RTX 3060/4070 (0.5B model)
make train-16gb     # RTX 4080/A4000 (1.5B model)
make train-24gb     # RTX 4090/A5000 (3B model)
```

**First-time setup:**

```bash
cd packages/training
make venv           # Create Python virtual environment
```

---

## GPU Profiles

GPU profiles auto-configure model size, vLLM memory, and batch size for your hardware.

### Available Profiles

| Profile | GPU | Model | vLLM Memory | Batch |
|---------|-----|-------|-------------|-------|
| `12gb` | RTX 3060/4070 | Qwen2.5-0.5B-Instruct | 25% | 1 |
| `16gb` | RTX 4080/A4000 | Qwen2.5-1.5B-Instruct | 35% | 1 |
| `24gb` | RTX 4090/A5000 | Qwen2.5-3B-Instruct | 40% | 2 |
| `48gb` | A40/A6000 | Qwen2.5-7B-Instruct | 45% | 4 |
| `cpu` | None | Qwen2.5-0.5B-Instruct | - | 1 |

### Using Profiles

```bash
# Via Makefile (recommended)
make train-12gb

# Via script directly
cd packages/training/python
source venv/bin/activate
python scripts/run_training.py --profile 12gb --steps 100

# List all profiles
python scripts/run_training.py --list-profiles

# Override profile settings
python scripts/run_training.py --profile 12gb --batch-size 2 --steps 50
```

Profile files are in `python/config/profiles/*.json`.

---

## Testing Tiers

| Tier | Name | Infrastructure | What's Tested | Time |
|------|------|----------------|---------------|------|
| 1 | Unit Tests | None | Pure logic, mocked I/O | ~30s |
| 2 | JSON Mode | Filesystem only | JSON trajectory loading/scoring | ~1min |
| 3 | DB Integration | Docker PostgreSQL | Full DB operations | ~2min |
| 4 | Full Stack | Docker + GPU | End-to-end training | ~10min+ |

**Recommendation:** Most development can be done at Tier 1-2. Only run Tier 3-4 before PRs or when debugging infrastructure.

---

## Manual Setup

If you prefer manual commands over the Makefile, follow these sections.

### Tier 1: No Infrastructure

**What it tests:** Pure logic - reward calculations, LR scheduling, archetype scoring, rubric loading.

**Requirements:** Python 3.11+, pip dependencies

```bash
# Setup (one-time)
cd packages/training/python
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
pip install -e .

# Run tests
pytest tests/ -v --ignore=tests/integration/ --ignore=tests/e2e/

# Run specific test file
pytest tests/test_archetype_scoring.py -v

# Run with coverage
pytest tests/ --cov=src/training --cov-report=html --ignore=tests/integration/
```

**Test Files:**

| File | Tests | What's Covered |
|------|-------|----------------|
| `test_archetype_scoring.py` | 73 | Reward weights, behavior bonuses, normalization |
| `test_lr_scheduler.py` | 32 | Constant/linear/cosine schedules, warmup |
| `test_service_manager.py` | 39 | Process lifecycle, ports, health checks |
| `test_training_orchestrator.py` | 25 | Environment validation, process management |
| `test_atropos_integration.py` | 89 | Reward API, relative scoring |

---

### Tier 2: JSON Mode

**What it tests:** Trajectory loading from JSON files, archetype extraction, scoring without database.

**Requirements:** Tier 1 + Generated trajectory JSON files

#### Step 1: Generate Trajectory Data

```bash
# From project root
bun run packages/engine/examples/generate-training-data.ts --causal --hours 2 --npcs 5

# Output: ./training-data-output/trajectories/*.json
```

#### Step 2: Run JSON Mode Tests

```bash
cd packages/training/python
source venv/bin/activate
pytest tests/integration/test_json_mode_integration.py -v
```

**Expected:** 20 tests passed

---

### Tier 3: Docker Infrastructure

**What it tests:** Full PostgreSQL operations, trajectory loading from DB, real connection pooling.

**Requirements:** Docker, Docker Compose

#### Step 1: Start Infrastructure

```bash
cd packages/training
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.test.yml ps  # Verify healthy
```

#### Step 2: Apply Schema

```bash
cd packages/db
DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  bunx drizzle-kit push --force
```

#### Step 3: Run Tests

```bash
cd packages/training/python
source venv/bin/activate
DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  pytest tests/integration/test_db_integration.py -v
```

**Expected:** 10 tests passed

#### Step 4: Cleanup

```bash
cd packages/training
docker compose -f docker-compose.test.yml down -v
```

---

### Tier 4: Full Local Stack

**What it tests:** Complete training pipeline including vLLM inference, Atropos API, model training.

**Requirements:**
- Tier 3 setup complete
- NVIDIA GPU (see [GPU Profiles](#gpu-profiles) for memory requirements)
- CUDA 12.1+
- vLLM installed (`pip install vllm`)

#### Quick Path (Recommended)

```bash
cd packages/training
make tier4 PROFILE=12gb
```

This automatically:
1. Starts Docker infrastructure
2. Applies database schema
3. Imports any existing trajectories
4. Runs one training step
5. Validates completion

#### Manual Path

##### Step 1: Start Infrastructure

```bash
cd packages/training
docker compose -f docker-compose.test.yml up -d

cd ../db
DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  bunx drizzle-kit push --force
```

##### Step 2: Generate & Import Training Data

```bash
# Generate (from project root)
bun run packages/engine/examples/generate-training-data.ts --causal --hours 2 --npcs 5

# Import to database
cd packages/training/python
source venv/bin/activate
DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  python scripts/import_json_trajectories.py --source ../../training-data-output
```

##### Step 3: Run Training

```bash
cd packages/training/python
source venv/bin/activate

export DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test
export WANDB_MODE=offline

# Use a GPU profile (recommended)
python scripts/run_training.py --profile 12gb --steps 1 --no-wandb

# Or specify manually
python scripts/run_training.py \
  --model Qwen/Qwen2.5-0.5B-Instruct \
  --vllm-gpu-memory 0.25 \
  --steps 1 \
  --batch-size 1 \
  --no-wandb
```

**Expected Output:**

```
BABYLON RL TRAINING PIPELINE
======================================================================
Model: Qwen/Qwen2.5-0.5B-Instruct
...
  ✓ atropos is ready
  ✓ vllm is ready
All services ready in 22.0s
...
TRAINING COMPLETE
Final checkpoint: ./trained_models/final_model
```

##### Step 4: Cleanup

```bash
pkill -f "run_training.py"
pkill -f "vllm"
pkill -f "atropos"

cd packages/training
docker compose -f docker-compose.test.yml down -v
```

---

## Cloud Testing

### GitHub Actions CI

The CI workflow automatically runs:
1. **Python unit tests** (Tier 1) - Always runs
2. **JSON integration tests** (Tier 2) - Always runs
3. **DB integration tests** (Tier 3) - Runs with PostgreSQL service container

**Workflow:** `.github/workflows/ci-unit-integration.yml`

### Manual Cloud Training

For GPU-enabled cloud training:

**Workflow:** `.github/workflows/rl-training.yml`

```bash
gh workflow run rl-training.yml -f force=true -f batch_id=test-$(date +%s)
```

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional
WANDB_API_KEY=your-wandb-key
WANDB_PROJECT=babylon-training
CUDA_VISIBLE_DEVICES=0
```

---

## CI/CD Integration

| Test Suite | CI Job | Blocking | Runs On |
|------------|--------|----------|---------|
| Python Unit | `python-training-tests` | ✅ Yes | All PRs |
| Python JSON Integration | `python-training-tests` | ✅ Yes | All PRs |
| Python DB Integration | `python-training-tests` | ✅ Yes | All PRs |
| TypeScript Unit | `test-unit-integration` | ✅ Yes | All PRs |
| E2E Training | `rl-training` | ❌ No | Cron/Manual |

### Running Tests Like CI

```bash
cd packages/training/python
source venv/bin/activate

# Unit tests
PYTHONPATH=. pytest tests/ -v --ignore=tests/integration/ --ignore=tests/e2e/ -x

# JSON integration
PYTHONPATH=. pytest tests/integration/test_json_mode_integration.py -v -x

# DB integration
PYTHONPATH=. DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  pytest tests/integration/test_db_integration.py -v -x
```

---

## Troubleshooting

### Common Issues

#### `ModuleNotFoundError: No module named 'training'`

```bash
cd packages/training/python
pip install -e .
```

#### `DATABASE_URL not set`

```bash
export DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test
```

#### `Connection refused` on port 5434

```bash
# Check if PostgreSQL is running
docker compose -f docker-compose.test.yml ps

# Restart if needed
docker compose -f docker-compose.test.yml restart postgres
```

#### `CUDA out of memory`

Use a smaller GPU profile:

```bash
# Instead of 24gb profile, use 12gb
python scripts/run_training.py --profile 12gb --steps 1

# Or reduce vLLM memory manually
python scripts/run_training.py --vllm-gpu-memory 0.2 --model Qwen/Qwen2.5-0.5B-Instruct
```

### Debug Mode

```bash
# Verbose pytest output
pytest tests/ -v -s --log-cli-level=DEBUG

# Single test with full traceback
pytest tests/test_archetype_scoring.py::TestArchetypeScoring::test_trader_weights -v -s --tb=long
```

### Log Locations

| Component | Log Location |
|-----------|--------------|
| vLLM | `./logs/services/vllm.log` |
| Atropos | `./logs/services/atropos.log` |
| Training | `./logs/training-*.log` |
| Pytest | Console output |

---

## Performance Benchmarks

| Operation | Expected Time | Hardware |
|-----------|---------------|----------|
| Tier 1 (unit tests) | ~30s | Any |
| Tier 2 (JSON mode) | ~60s | Any |
| Tier 3 (DB integration) | ~90s | Docker |
| Tier 4 (full training) | ~10min | GPU |
| Score 1000 trajectories | <10s | Any |
| Load model (vLLM) | 30-120s | GPU |

---

## Summary

1. **Use `make` commands** - Fastest path for all tiers
2. **Start with Tier 1** - Always works, no setup
3. **Use GPU profiles** - Auto-configures for your hardware
4. **Tier 4 only when needed** - Requires GPU, takes time

```bash
# The quick way
cd packages/training
make tier1 tier2              # Fast validation
make tier4 PROFILE=12gb       # Full GPU test
```

---

*Last updated: 2025-12-30*
