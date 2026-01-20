# Babylon RL Training Plan - 60-Day Simulation Data

## Executive Summary

This plan covers training on your 60-day simulation run with Qwen3-30B for maximum model quality.

**Recommended Setup:** RunPod with **4x H100 GPUs (320GB total VRAM)**
- GPUs 0-1: vLLM inference (tensor parallel, 160GB)
- GPUs 2-3: GRPO training (FSDP, 160GB)
- Model: Qwen/Qwen3-30B-A3B
- Estimated training time: **2-3 hours** for 5000 steps

---

## ⚠️ Critical Lessons Learned (Jan 2026)

### Problem 1: Supabase Pooler Breaks Training

**Symptom:** Training hangs indefinitely at "Loading trajectories..."

**Root Cause:** The training code uses `asyncpg` which relies on PostgreSQL prepared statements. Supabase's connection pooler (port `6543`) uses transaction pooling which **breaks prepared statements**.

**Solution:** Use Supabase's **DIRECT connection** (port `5432`), not the pooler:

```bash
# ❌ WRONG - Pooler (port 6543) - CAUSES HANGING
DATABASE_URL="postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# ✅ CORRECT - Direct (port 5432) - WORKS
DATABASE_URL="postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres"
```

**How to get direct URL:**
1. Supabase Dashboard → Settings → Database
2. Connection string → "URI" (NOT "Pooler URI")
3. Should show port `5432`

### Problem 2: Trajectory Lookback Window Too Short

**Symptom:** "No trajectories available" even after successful import

**Root Cause:** Default lookback was 72 hours. If trajectories were imported with old timestamps, they're excluded.

**Solution:** Increased default to 720 hours (30 days). Override with:
```bash
python scripts/run_training.py --profile h100-4gpu --lookback-hours 720
```

### Problem 3: Wasted GPU Time on Setup

**Symptom:** 2+ hours of $14/hr GPU time spent on pip installs

**Solution:** Created pre-built Docker image with all dependencies:
```bash
# Build once (locally or in CI):
make docker-build-runpod

# Use on RunPod:
# Select "babylon-training:runpod" as template image
```

### Problem 4: Large Trajectory Payloads Cause OOM

**Symptom:** Memory errors or timeouts when loading trajectories

**Solution:** Added `max_trajectories` limit (default 1000) and pagination.

---

## GPU Selection for 30B Model

### VRAM Requirements for Qwen3-30B

```
vLLM Inference (2x H100):         Training (2x H100):
├── 30B model (sharded): ~30GB    ├── 30B model (sharded): ~30GB
├── KV cache (8K ctx): ~20GB      ├── Optimizer states: ~60GB (sharded)
├── Headroom: ~30GB               ├── Gradients: ~30GB (sharded)
└── Total per GPU: ~40GB          └── Total per GPU: ~60GB
```

### Profile Comparison

| Profile | GPUs | VRAM | Model | Est. Time | Cost/hr | Total Cost |
|---------|------|------|-------|-----------|---------|------------|
| `h100-4gpu` | 4x H100 | 320GB | **Qwen3-30B** | **2-3 hours** | ~$14 | **~$42** ✅ Fastest |
| `a100-4gpu` | 4x A100-80GB | 320GB | **Qwen3-30B** | 3-4 hours | ~$8 | ~$32 ✅ Best value |
| `l40-8gpu` | 8x L40 | 384GB | **Qwen3-30B** | 4-5 hours | ~$10 | ~$50 |
| `l40-4gpu` | 4x L40 | 192GB | Qwen3-30B | 6-8 hours | ~$5 | ~$40 |

**Recommended: `h100-4gpu`** - Fastest training with dedicated vLLM/training GPUs.

### Why Dedicated GPUs for vLLM vs Training?

The new profiles (`h100-4gpu`, `a100-4gpu`, `l40-8gpu`) split GPUs:
- **vLLM GPUs**: Run inference in parallel, no memory pressure from training
- **Training GPUs**: Run FSDP without competing for KV cache memory
- **Result**: Higher batch sizes, faster throughput, no OOM conflicts

---

## Phase 1: Pre-Training Setup

### 1.1 RunPod Instance Setup

```bash
# 1. Create RunPod instance
# - Template: RunPod PyTorch 2.1 (CUDA 12.1)
#   OR use pre-built: babylon-training:runpod (see below)
# - GPU: 4x NVIDIA H100 SXM 80GB
# - Container Disk: 150GB (for 30B model weights)
# - Volume: 50GB (persistent storage)

# 2. SSH into instance
ssh root@<runpod-ip>

# 3. Clone repository
git clone https://github.com/BabylonSocial/babylon.git bab
cd bab
git checkout staging

# 4. Verify GPUs
nvidia-smi
# Should show 4x H100 with 80GB each
```

### 1.2 Option A: Use Pre-Built Docker Image (Recommended)

If you've built and pushed the RunPod image:

```bash
# On RunPod, select custom image: your-org/babylon-training:runpod
# This skips most setup - just configure DATABASE_URL
```

### 1.2 Option B: Manual Setup (Using Improved Script)

```bash
cd packages/training

# Set DATABASE_URL FIRST (critical!)
# ⚠️ Use DIRECT connection (port 5432), NOT pooler (port 6543)
export DATABASE_URL="postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres"

# Run setup script (improved - ~15 min vs 2+ hours previously)
bash scripts/runpod_setup.sh

# Activate environment
source python/venv/bin/activate
```

### 1.3 Database Setup

> **⚠️ CRITICAL:** Use Supabase's DIRECT connection, NOT the pooler!

#### Option A: Supabase (Recommended)

```bash
# 1. Create free Supabase project at https://supabase.com
# 2. Get DIRECT connection string:
#    Settings → Database → Connection string → URI (NOT Pooler)
#    Should show port 5432, NOT 6543

# 3. Set DATABASE_URL
export DATABASE_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres"
```

#### Option B: Neon (Free Tier)

```bash
# 1. Create free Neon project at https://neon.tech
# 2. Get connection string from dashboard

export DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

#### Option C: Install PostgreSQL Natively

```bash
# Install PostgreSQL in the RunPod container
apt-get update && apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL
service postgresql start

# Create database and user
sudo -u postgres psql -c "CREATE USER babylon_test WITH PASSWORD 'test_password';"
sudo -u postgres psql -c "CREATE DATABASE babylon_test OWNER babylon_test;"

# Set connection URL
export DATABASE_URL="postgresql://babylon_test:test_password@localhost:5432/babylon_test"
```

#### Apply Schema (All Options) - Using Real Migration

```bash
# Bun is required for drizzle migrations
# Install bun if not already available
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Verify bun
bun --version

# Install dependencies for the db package
cd /root/bab/packages/db
bun install

# Run the real drizzle migration
DATABASE_URL="$DATABASE_URL" bunx drizzle-kit push --force

# Expected output:
# [✓] Pulling schema from database...
# [✓] Changes applied
```

#### Verify Database Connection

```bash
cd /root/bab/packages/training
source python/venv/bin/activate

python -c "
import os
import asyncio
import asyncpg

async def test():
    # Use statement_cache_size=0 for pooler compatibility
    pool = await asyncpg.create_pool(
        os.environ['DATABASE_URL'],
        min_size=1, max_size=1,
        statement_cache_size=0,
        command_timeout=30
    )
    async with pool.acquire() as conn:
        count = await conn.fetchval('SELECT COUNT(*) FROM trajectories WHERE \"isTrainingData\" = true')
        print(f'✅ Database connected! Training trajectories: {count}')
    await pool.close()

asyncio.run(test())
"
```

### 1.4 Transfer Training Data

```bash
# From your local machine:
scp ~/babs-training/training-data-*.tar.gz root@<runpod-ip>:/root/bab/

# On RunPod:
cd /root/bab
tar -xzf training-data-output.tar.gz
ls -la training-data-output/trajectories/
# Should show ~721 trajectory JSON files
```

### 1.5 Import Trajectories

```bash
cd packages/training
source python/venv/bin/activate

# Set database URL
export DATABASE_URL="postgresql://..."  # Your direct connection

# Dry run first (validate without inserting)
python python/scripts/import_json_trajectories.py \
  --source /root/bab/training-data-output \
  --dry-run --verbose

# If validation passes, import
python python/scripts/import_json_trajectories.py \
  --source /root/bab/training-data-output \
  --verbose

# Expected output:
# Total files: 721
# Valid trajectories: 721
# Inserted: 721
```

### 1.6 Environment Variables

```bash
cat > python/.env << 'EOF'
# Database - USE DIRECT CONNECTION (port 5432), NOT pooler (6543)!
DATABASE_URL=postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres

# OpenAI (for RLAIF judge scoring)
OPENAI_API_KEY=sk-your-key-here

# W&B (recommended for monitoring)
WANDB_API_KEY=your-wandb-key
WANDB_PROJECT=babylon-training
WANDB_ENTITY=your-team

# CUDA - all 4 GPUs visible
CUDA_VISIBLE_DEVICES=0,1,2,3
EOF
```

---

## Phase 2: Training Execution

### 2.1 Pre-Flight Checks

```bash
cd packages/training
source python/venv/bin/activate

# Run tier1 unit tests
make tier1

# Verify GPU availability
nvidia-smi

# Verify database has trajectories
python -c "
import os
import asyncio
import asyncpg

async def check():
    pool = await asyncpg.create_pool(os.environ['DATABASE_URL'], statement_cache_size=0)
    async with pool.acquire() as conn:
        total = await conn.fetchval('SELECT COUNT(*) FROM trajectories')
        training = await conn.fetchval('SELECT COUNT(*) FROM trajectories WHERE \"isTrainingData\" = true')
        print(f'Total trajectories: {total}')
        print(f'Training trajectories: {training}')
    await pool.close()

asyncio.run(check())
"
# Expected: Training trajectories: 721

# Test model loading (downloads 30B weights - takes a few minutes)
python -c "
from transformers import AutoTokenizer
print('Loading Qwen3-30B tokenizer...')
tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen3-30B-A3B')
print('Model loadable!')
"
```

### 2.2 Start Training (Using Makefile)

```bash
cd packages/training

# RECOMMENDED: 4x H100 with 30B model (fastest)
make train-h100-4gpu

# Alternative: 4x A100 (best value)
make train-a100-4gpu

# Alternative: 8x L40 (if H100/A100 unavailable)
make train-l40-8gpu

# With W&B logging (production):
make train-cloud PROFILE=h100-4gpu \
  WANDB_PROJECT=babylon-training \
  WANDB_RUN_NAME="60day-sim-30B-v1"

# If trajectories aren't being found (increase lookback):
python python/scripts/run_training.py \
  --profile h100-4gpu \
  --lookback-hours 720 \
  --steps 5000
```

### 2.3 Training Parameters (h100-4gpu Profile)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `model` | Qwen/Qwen3-30B-A3B | Best quality model |
| `vllm_gpu` | "0,1" | GPUs 0-1 dedicated to inference |
| `training_gpu` | "2,3" | GPUs 2-3 dedicated to training |
| `tensor_parallel_size` | 2 | vLLM shards model across 2 GPUs |
| `fsdp_enabled` | true | Training shards across 2 GPUs |
| `vllm_gpu_memory` | 0.80 | 80% of GPU memory for vLLM |
| `batch_size` | 8 | Higher batch with dedicated GPUs |
| `group_size` | 4 | 4 completions per prompt for GRPO |
| `total_steps` | 5000 | Full training run |
| `learning_rate` | 5e-6 | Conservative for 30B stability |

### 2.4 Monitoring During Training

```bash
# Terminal 1: Watch GPU usage (all 4 GPUs)
watch -n 2 nvidia-smi

# Terminal 2: Tail training logs
tail -f python/logs/trainer.log

# Terminal 3: Tail vLLM logs
tail -f python/logs/services/vllm.log

# W&B Dashboard (if enabled):
# https://wandb.ai/your-team/babylon-training
```

### 2.5 Expected Training Timeline (h100-4gpu)

| Step Range | Time | What's Happening |
|------------|------|------------------|
| 0 | 0m | Model loading to 4 GPUs |
| 0 | ~5m | vLLM ready (30B takes longer to load) |
| 1-10 | ~8m | Warmup phase, first rollouts |
| 10-100 | ~15m | Early training, high loss |
| 100-1000 | ~45m | Loss stabilizing |
| 1000-5000 | ~2h | Steady improvement |
| 5000 | ~2.5h | Training complete |

**Total estimated time: 2-3 hours** (vs 6-8 hours on 2x L40)

### 2.6 Checkpointing

Checkpoints are saved automatically:
- Location: `python/trained_models/`
- Frequency: Every 250 steps
- Kept: Last 3 checkpoints

```bash
# Check checkpoint directory
ls -la python/trained_models/
# step_250/  step_500/  step_750/  ...
```

### 2.7 Resuming Training

If training crashes or you need to resume:

```bash
cd packages/training
python python/scripts/run_training.py \
  --profile h100-4gpu \
  --resume ./python/trained_models/step_2500 \
  --steps 5000
```

---

## Phase 3: Post-Training Evaluation

### 3.1 Quick Model Test

```bash
cd packages/training
source python/venv/bin/activate

python python/scripts/test_trained_model.py \
  --model-path ./python/trained_models/final_model \
  --backend cuda
```

### 3.2 Run Benchmark Suite

```bash
cd packages/training

# Quick benchmark
bun run benchmark:quick -- --model ./python/trained_models/final_model

# Full benchmark
bun run benchmark -- --model ./python/trained_models/final_model

# Results saved to: benchmark-results/<timestamp>/
```

### 3.3 A/B Test Against Baseline (Using Makefile)

```bash
cd packages/training

# Quick A/B test
make ab-test-quick

# Full A/B test with custom runs
make ab-test \
  MODEL_A=Qwen/Qwen3-30B-A3B \
  MODEL_B=./python/trained_models/final_model \
  AB_RUNS=3

# Results saved to: ab_test_results/
```

### 3.4 Export Model

```bash
# Copy to persistent volume
cp -r python/trained_models/final_model /workspace/models/

# Or upload to HuggingFace
python -c "
from huggingface_hub import HfApi
api = HfApi()
api.upload_folder(
    folder_path='./python/trained_models/final_model',
    repo_id='your-org/babylon-trader-30b',
    repo_type='model'
)
"
```

---

## Phase 4: Troubleshooting

### 4.1 Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Training hangs** | Stuck at "Loading trajectories" | Use direct DB connection (port 5432), not pooler (6543) |
| **No trajectories found** | "Not enough samples" error | Increase `--lookback-hours 720` |
| vLLM OOM | `CUDA out of memory` on GPU 0/1 | Reduce `vllm_gpu_memory` to 0.70 |
| Training OOM | `CUDA out of memory` on GPU 2/3 | Reduce `batch_size` to 4 |
| Slow model load | 30B takes >10 min to load | Normal - 60GB model takes time |
| FSDP errors | Sharding failures | Ensure `fsdp_enabled: true` in profile |

### 4.2 Database Connection Issues

```bash
# Check if using pooler (bad) vs direct (good)
echo $DATABASE_URL | grep -E ':(5432|6543)'
# Should show 5432

# Test connection
python -c "
import os, asyncio, asyncpg
async def test():
    pool = await asyncpg.create_pool(
        os.environ['DATABASE_URL'],
        statement_cache_size=0,  # Required for pooler compatibility
        command_timeout=30
    )
    async with pool.acquire() as conn:
        print('Connected!')
        count = await conn.fetchval('SELECT COUNT(*) FROM trajectories')
        print(f'Trajectories: {count}')
    await pool.close()
asyncio.run(test())
"
```

### 4.3 Useful Debug Commands

```bash
# Check vLLM health
curl http://localhost:9001/health

# Check Atropos health
curl http://localhost:8000/

# Query trajectory count
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM trajectories"

# Check GPU memory per device
nvidia-smi --query-gpu=index,memory.used,memory.free --format=csv

# Monitor GPU utilization
nvidia-smi dmon -s u
```

### 4.4 Emergency Recovery

```bash
# Kill all Python processes
pkill -9 -f python

# Clear CUDA cache
python -c "import torch; torch.cuda.empty_cache()"

# Restart database (if using local)
make db-reset
```

---

## Appendix A: Cost Estimation

### H100 Option (Fastest)

| Phase | Duration | GPUs | Cost/hr | Total |
|-------|----------|------|---------|-------|
| Setup | 0.25h | 4x H100 | $14.00 | $3.50 |
| Training | 2.5h | 4x H100 | $14.00 | $35.00 |
| Evaluation | 0.5h | 4x H100 | $14.00 | $7.00 |
| **Total** | **3.25h** | | | **~$46** |

*Note: Setup reduced from 0.5h to 0.25h with improved scripts*

### A100 Option (Best Value)

| Phase | Duration | GPUs | Cost/hr | Total |
|-------|----------|------|---------|-------|
| Setup | 0.25h | 4x A100 | $8.00 | $2.00 |
| Training | 3.5h | 4x A100 | $8.00 | $28.00 |
| Evaluation | 0.5h | 4x A100 | $8.00 | $4.00 |
| **Total** | **4.25h** | | | **~$34** |

---

## Appendix B: All Profile Options

### 30B Model Profiles (Recommended)

| Profile | Command | GPUs | Time | Cost |
|---------|---------|------|------|------|
| `h100-4gpu` | `make train-h100-4gpu` | 4x H100 | 2-3h | ~$46 |
| `a100-4gpu` | `make train-a100-4gpu` | 4x A100 | 3-4h | ~$34 |
| `l40-8gpu` | `make train-l40-8gpu` | 8x L40 | 4-5h | ~$50 |
| `l40-4gpu` | `make train-l40-4gpu` | 4x L40 | 6-8h | ~$40 |

### 14B Model Profiles (Budget)

| Profile | Command | GPUs | Time | Cost |
|---------|---------|------|------|------|
| `l40-2gpu` | `make train-l40-2gpu` | 2x L40 | 6-8h | ~$21 |
| `l40` | `make train-l40` | 1x L40 | 10-12h | ~$15 |

---

## Appendix C: Docker Images for RunPod

### Building the RunPod Image

```bash
cd packages/training

# Build basic RunPod image (~15-30 min, includes flash-attn)
make docker-build-runpod

# Build with model pre-downloaded (~1 hr, ~100GB image, instant startup)
make docker-build-runpod-30b

# Push to Docker Hub
make docker-push-runpod DOCKER_REPO=your-org/babylon-training
```

### Using Pre-Built Image on RunPod

1. Create a new pod on RunPod
2. Select "Custom Template" 
3. Enter image: `your-org/babylon-training:runpod`
4. Set environment variable: `DATABASE_URL=postgresql://...`
5. Deploy and SSH in
6. Run: `python3.11 python/scripts/run_training.py --profile h100-4gpu`

---

## Appendix D: Quick Reference Commands

```bash
# === Setup ===
make venv                    # Create Python venv
cd packages/db && bun install && bunx drizzle-kit push --force  # Apply schema
make tier1                   # Run unit tests

# === Training (30B) ===
make train-h100-4gpu         # Fastest: 4x H100
make train-a100-4gpu         # Best value: 4x A100
make train-l40-8gpu          # 8x L40 option
make train-l40-4gpu          # 4x L40 (shared GPUs)

# === Training (14B - Budget) ===
make train-l40-2gpu          # 2x L40
make train-l40               # 1x L40

# === With W&B Logging ===
make train-cloud PROFILE=h100-4gpu WANDB_PROJECT=babylon-training

# === Increase Lookback (if trajectories not found) ===
python python/scripts/run_training.py --profile h100-4gpu --lookback-hours 720

# === Docker Images ===
make docker-build-runpod     # Build RunPod image
make docker-push-runpod DOCKER_REPO=your-org/babylon  # Push to registry

# === Evaluation ===
make ab-test-quick           # Quick A/B vs baseline
bun run benchmark:quick      # Quick benchmark

# === Monitoring ===
tail -f python/logs/trainer.log
nvidia-smi -l 2
```

---

## Checklist

### Pre-Training
- [ ] RunPod instance created (4x H100 recommended)
- [ ] Repository cloned, staging branch
- [ ] **DATABASE_URL uses port 5432 (direct), NOT 6543 (pooler)**
- [ ] Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- [ ] `make venv` completed OR using Docker image
- [ ] GPU packages installed (torch, vllm, flash-attn)
- [ ] Schema applied (`cd packages/db && bunx drizzle-kit push --force`)
- [ ] Training data transferred and extracted
- [ ] Trajectories imported (721 expected)
- [ ] Environment variables set (`.env`)
- [ ] `make tier1` - tests passing

### During Training
- [ ] vLLM started on GPUs 0-1 (check logs)
- [ ] Training running on GPUs 2-3
- [ ] First rollouts completing (not hanging!)
- [ ] W&B logging (if enabled)
- [ ] GPU memory stable (~60-70GB per GPU)
- [ ] Checkpoints being saved

### Post-Training
- [ ] Final model saved
- [ ] `make ab-test-quick` run
- [ ] Benchmark suite run
- [ ] Model exported/uploaded
- [ ] RunPod instance terminated

---

*Generated: 2026-01-20*
*Updated: Fixed Supabase pooler issue, improved setup scripts, added Docker images*
*Data Source: 60-day simulation run (721 trajectories)*
*Model: Qwen3-30B-A3B*
