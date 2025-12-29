# Training Pipeline Testing Guide

> **Zero to Hero:** Complete guide for testing the Babylon training pipeline locally and in the cloud.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Testing Tiers](#testing-tiers)
3. [Local Development](#local-development)
   - [Without Infrastructure](#tier-1-no-infrastructure)
   - [With JSON Mode](#tier-2-json-mode)
   - [With Docker](#tier-3-docker-infrastructure)
   - [Full Stack](#tier-4-full-local-stack)
4. [Cloud Testing](#cloud-testing)
5. [CI/CD Integration](#cicd-integration)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Run All Unit Tests (No Setup Required)

```bash
# Python unit tests
cd packages/training/python
pip install -r requirements.txt
pip install -e .
pytest tests/ -v --ignore=tests/integration/ --ignore=tests/e2e/

# TypeScript unit tests
cd packages/training
bun test src/ --preload ../testing/unit/preload.ts
```

### Run Integration Tests (Requires Docker)

```bash
# Start test infrastructure
cd packages/training
docker compose -f docker-compose.test.yml up -d

# Wait for services
sleep 5

# Run tests
cd python
DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  pytest tests/integration/ -v

# Cleanup
cd ..
docker compose -f docker-compose.test.yml down -v
```

---

## Testing Tiers

| Tier | Name | Infrastructure | What's Tested | Time |
|------|------|----------------|---------------|------|
| 1 | Unit Tests | None | Pure logic, mocked I/O | ~30s |
| 2 | JSON Mode | Filesystem only | JSON trajectory loading/scoring | ~1min |
| 3 | DB Integration | Docker PostgreSQL | Full DB operations | ~2min |
| 4 | Full Stack | Docker + GPU | End-to-end training | ~10min+ |

---

## Local Development

### Tier 1: No Infrastructure

**What it tests:** Pure logic - reward calculations, LR scheduling, archetype scoring, rubric loading.

**Requirements:** Python 3.11+, pip dependencies

```bash
# Setup
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
cd packages/engine/examples
bun run generate-training-data.ts --causal --days 1

# This creates: ./training-data-output/trajectories/*.json
```

#### Step 2: Verify Data Structure

```bash
# Check trajectory files exist
ls -la ./training-data-output/trajectories/

# Inspect a trajectory
cat ./training-data-output/trajectories/*.json | head -100 | jq '.trajectory | {id: .trajectoryId, archetype: .archetype, steps: (.stepsJson | fromjson | length)}'
```

#### Step 3: Run JSON Mode Tests

```bash
cd packages/training/python

# Run JSON integration tests (no DB required)
pytest tests/integration/test_json_mode_integration.py -v
```

**Expected Output:**

```
tests/integration/test_json_mode_integration.py::TestJsonTrajectoryLoading::test_load_single_trajectory PASSED
tests/integration/test_json_mode_integration.py::TestJsonTrajectoryLoading::test_load_trajectory_with_archetype PASSED
...
========================= 20 passed in 1.52s =========================
```

#### Step 4: Manual Validation

```python
# Interactive validation
from training.rewards import archetype_composite_reward, TrajectoryRewardInputs, BehaviorMetrics

inputs = TrajectoryRewardInputs(
    final_pnl=500.0,
    starting_balance=10000.0,
    end_balance=10500.0,
    format_score=0.8,
    reasoning_score=0.75,
)

metrics = BehaviorMetrics(trades_executed=5, profitable_trades=3)

score = archetype_composite_reward(inputs, archetype="trader", behavior_metrics=metrics)
print(f"Score: {score:.4f}")  # Should be ~0.6-0.8
```

---

### Tier 3: Docker Infrastructure

**What it tests:** Full PostgreSQL operations, trajectory loading from DB, real connection pooling.

**Requirements:** Docker, Docker Compose

#### Step 1: Start Test Infrastructure

```bash
cd packages/training

# Start PostgreSQL and Redis
docker compose -f docker-compose.test.yml up -d

# Verify services are running
docker compose -f docker-compose.test.yml ps
```

**Expected Output:**

```
NAME                          STATUS          PORTS
babylon-postgres-test         Up (healthy)    0.0.0.0:5434->5432/tcp
babylon-redis-test            Up (healthy)    0.0.0.0:6381->6379/tcp
```

#### Step 2: Initialize Database Schema

```bash
# Apply migrations (from project root)
DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  bun run db:push
```

#### Step 3: Run DB Integration Tests

```bash
cd packages/training/python

DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  pytest tests/integration/test_db_integration.py -v
```

#### Step 4: Import JSON Trajectories to DB (Optional)

```bash
# If you have JSON trajectories from Tier 2
cd packages/training/python

DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  python scripts/import_json_trajectories.py ../../engine/examples/training-data-output/trajectories
```

#### Step 5: Cleanup

```bash
cd packages/training
docker compose -f docker-compose.test.yml down -v
```

---

### Tier 4: Full Local Stack

**What it tests:** Complete training pipeline including vLLM inference, Atropos API, W&B logging.

**Requirements:** 
- Tier 3 setup complete
- NVIDIA GPU with 12GB+ VRAM (24GB+ recommended for larger models)
- CUDA 12.1+
- vLLM installed
- OpenAI API key (for AI judge scoring)
- W&B account (optional)

**GPU Memory Guidelines:**
| GPU VRAM | Recommended Model | Notes |
|----------|-------------------|-------|
| 12GB | Qwen2.5-1.5B-Instruct | Works on RTX 3060/4070 |
| 16GB | Qwen2.5-3B-Instruct | Works on RTX 4080/A4000 |
| 24GB+ | Qwen2.5-7B-Instruct | RTX 4090/A5000/A6000 |

#### Step 1: Prerequisites Check

```bash
cd packages/training/python
source venv/bin/activate
python -c "import sys; sys.path.insert(0, '.'); from src.training.service_manager import check_prerequisites; issues = check_prerequisites(); print('Issues:', issues if issues else 'None - all prerequisites met!')"
```

**Expected Output:**

```
Issues: None - all prerequisites met!
```

If you see errors:
- `DATABASE_URL not set` → `export DATABASE_URL=postgresql://...`
- `Atropos API not found` → `pip install atroposlib`
- `vLLM not installed` → `pip install vllm`
- `CUDA not available` → Install CUDA or use `--skip-vllm`

#### Step 2: Start Infrastructure

```bash
# Terminal 1: PostgreSQL
cd packages/training
docker compose -f docker-compose.test.yml up postgres

# Terminal 2: Set environment
export DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test
export WANDB_MODE=offline  # or set WANDB_API_KEY for real logging
```

#### Step 3: Run Training (Dry Run)

```bash
cd packages/training/python

# Dry run validates everything without actual training
python src/training/run_training.py --dry-run --steps 1
```

#### Step 4: Run Full Training

```bash
# With real vLLM (requires GPU)
python src/training/run_training.py --steps 10 --batch-size 4

# Without vLLM (use external inference)
python src/training/run_training.py --skip-vllm --steps 10
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

For GPU-enabled cloud training, use the RL Training workflow:

**Workflow:** `.github/workflows/rl-training.yml`

```bash
# Trigger via GitHub CLI
gh workflow run rl-training.yml -f force=true -f batch_id=test-$(date +%s)
```

### Cloud Infrastructure Requirements

| Service | Purpose | Required |
|---------|---------|----------|
| PostgreSQL | Trajectory storage | ✅ Yes |
| Redis | Rate limiting, caching | ⚠️ Optional |
| W&B | Metrics logging | ⚠️ Optional |
| GPU Instance | vLLM inference | ✅ Yes for training |
| S3/GCS | Model checkpoints | ⚠️ Optional |

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional but recommended
WANDB_API_KEY=your-wandb-key
WANDB_PROJECT=babylon-training
WANDB_ENTITY=your-team

# GPU/Inference
CUDA_VISIBLE_DEVICES=0
VLLM_GPU_MEMORY_UTILIZATION=0.85
```

---

## CI/CD Integration

### Test Matrix

| Test Suite | CI Job | Blocking | Runs On |
|------------|--------|----------|---------|
| Python Unit | `python-training-tests` | ✅ Yes | All PRs |
| Python JSON Integration | `python-training-tests` | ✅ Yes | All PRs |
| Python DB Integration | `python-training-tests` | ✅ Yes | All PRs |
| TypeScript Unit | `test-unit-integration` | ✅ Yes | All PRs |
| TypeScript Integration | `test-unit-integration` | ✅ Yes | All PRs |
| E2E Training | `rl-training` | ❌ No | Cron/Manual |

### Running Tests Locally Like CI

```bash
# Exactly as CI runs them
cd packages/training/python

# Unit tests
PYTHONPATH=src pytest tests/ -v --ignore=tests/integration/ --ignore=tests/e2e/ -x

# JSON integration
PYTHONPATH=src pytest tests/integration/test_json_mode_integration.py -v -x

# DB integration (requires docker-compose.test.yml running)
PYTHONPATH=src DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  pytest tests/integration/test_db_integration.py -v -x
```

---

## Troubleshooting

### Common Issues

#### 1. `ModuleNotFoundError: No module named 'training'`

```bash
# Install package in editable mode
cd packages/training/python
pip install -e .
```

#### 2. `DATABASE_URL not set`

```bash
# For local testing
export DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test

# Verify connection
python -c "import asyncpg; import asyncio; asyncio.run(asyncpg.connect('$DATABASE_URL'))"
```

#### 3. `Connection refused` on port 5434

```bash
# Check if PostgreSQL is running
docker compose -f docker-compose.test.yml ps

# Restart if needed
docker compose -f docker-compose.test.yml restart postgres
```

#### 4. `CUDA out of memory`

```bash
# Reduce GPU memory utilization
export VLLM_GPU_MEMORY_UTILIZATION=0.7

# Or skip vLLM entirely
python src/training/run_training.py --skip-vllm
```

#### 5. Tests pass locally but fail in CI

```bash
# Run with same constraints as CI
cd packages/training/python
PYTHONPATH=src pytest tests/ -v -x --tb=short
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

## Test Data

### Synthetic Trajectories

For testing without real data, use the fixtures in `tests/integration/conftest.py`:

```python
from tests.integration.conftest import sample_trader_trajectory, sample_degen_trajectory

# Access trajectory data
traj = sample_trader_trajectory()
print(traj.steps_json)
```

### Generating Test Data

```bash
# Generate 1 day of synthetic trajectories
cd packages/engine/examples
bun run generate-training-data.ts --causal --days 1

# Output: ./training-data-output/trajectories/*.json
```

### Importing to Database

```bash
cd packages/training/python

# Dry run first
python scripts/import_json_trajectories.py ./training-data-output/trajectories --dry-run

# Actual import
DATABASE_URL=postgresql://... python scripts/import_json_trajectories.py ./training-data-output/trajectories
```

---

## Performance Benchmarks

| Operation | Expected Time | Hardware |
|-----------|---------------|----------|
| Unit tests (all) | ~30s | Any |
| JSON integration | ~60s | Any |
| DB integration | ~90s | Docker |
| Score 1000 trajectories | <10s | Any |
| Load model (vLLM) | 30-120s | GPU |
| Training step | 5-30s | GPU |

---

## Summary

1. **Start with Tier 1** - Always works, no setup
2. **Progress to Tier 2** - When you need to test data loading
3. **Use Tier 3** - When you need DB operations
4. **Tier 4 only when needed** - Requires GPU, takes time

Most development can be done at Tier 1-2. Only run Tier 3-4 before PRs or when debugging infrastructure issues.

---

*Last updated: 2024-12-29*

