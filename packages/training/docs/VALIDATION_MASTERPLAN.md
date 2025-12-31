# Babylon RL Training Validation Master Plan

Complete step-by-step validation of the training pipeline from local testing through cloud production.

## Quick Reference

| Phase | Time | Prerequisites | Command |
|-------|------|---------------|---------|
| 1. Unit Tests | 5 min | Python venv | `make tier1` |
| 2. JSON Mode | 10 min | Python venv | `make tier2` |
| 3. Database | 15 min | Docker | `make tier3` |
| 4. Local GPU | 30 min | GPU, Docker | `make tier4` |
| 5. Online Bridge | 30 min | bun, Docker | `make bridge-server` + `make train-online` |
| 6. Data Generation | 1-24h | API keys | `make generate-data` |
| 7. Cloud Setup | 1h | Cloud access | Manual |
| 8. Production Run | 12-48h | L40 GPUs | `make train-l40-4gpu` |

---

## Phase 1: Local Environment Validation (No GPU Required)

### 1.1 Setup Virtual Environment

```bash
cd packages/training
make venv

# Activate it
source python/venv/bin/activate

# Verify installation
python -c "from src.training import SimulationBridge, EvaluationSuite; print('✓ Imports OK')"
```

### 1.2 Tier 1: Unit Tests

Tests all Python modules without infrastructure.

```bash
make tier1
```

**Expected Output:**
- All tests pass
- Coverage of: rewards, format_validator, quality_scorer, tokenization_utils, scenario_pool, simulation_bridge, evaluation, kl_controller, multi_turn

**If tests fail:**
```bash
# Run specific test for debugging
cd python && PYTHONPATH=. pytest tests/test_rewards.py -v -x

# Run with more output
cd python && PYTHONPATH=. pytest tests/ -v --tb=long
```

### 1.3 Tier 2: JSON Mode Integration

Tests JSON parsing and format validation.

```bash
make tier2
```

**Expected Output:**
- JSON mode tests pass
- Format validator correctly identifies valid/invalid responses

---

## Phase 2: Database Integration (Docker Required)

### 2.1 Start Test Database

```bash
# Start PostgreSQL and Redis
make db-up

# Apply schema
make db-migrate

# Verify
docker compose -f docker-compose.test.yml ps
```

**Expected Output:**
```
NAME                    STATUS
babylon-test-postgres   running (healthy)
babylon-test-redis      running
```

### 2.2 Tier 3: Database Integration Tests

```bash
make tier3
```

**Expected Output:**
- Database connection works
- Trajectory loading works
- Schema is correct

**If database tests fail:**
```bash
# Check database is accessible
docker exec -it babylon-test-postgres psql -U babylon_test -d babylon_test -c "SELECT 1"

# Reset and try again
make db-reset
make tier3
```

---

## Phase 3: GPU Training Validation (12GB+ GPU Required)

### 3.1 Generate Test Trajectories

First, generate some trajectory data:

```bash
# Option A: Quick test data (2 hours sim, 5 NPCs)
make tier4-generate

# Option B: Use existing training-data-output if available
ls ../../training-data-output/trajectories/
```

### 3.2 Import Trajectories to Database

```bash
make tier4-import
```

**Expected Output:**
```
Imported X trajectories to database
```

### 3.3 Tier 4: GPU Training Test

```bash
# With your 12GB GPU
make tier4

# Or explicitly:
make train-12gb
```

**Expected Output:**
- vLLM starts successfully
- GRPO trainer connects to Atropos API
- 1 training step completes
- Logs show: loss, score, format_compliance

**Troubleshooting:**
```bash
# If vLLM OOMs, try lower memory:
cd python && python scripts/run_training.py --profile cpu --steps 1 --no-wandb

# Check GPU memory:
nvidia-smi

# If tokenizer fails:
huggingface-cli login
```

---

## Phase 4: Online Training Validation (Simulation Bridge)

### 4.1 Start Simulation Bridge Server

In terminal 1:
```bash
make bridge-server
```

**Expected Output:**
```
Starting simulation bridge server on port 3001
Simulation bridge server running at http://localhost:3001
```

### 4.2 Test Bridge Endpoints

In terminal 2:
```bash
# Health check
curl http://localhost:3001/health

# Initialize simulation
curl -X POST http://localhost:3001/init \
  -H "Content-Type: application/json" \
  -d '{"numNPCs": 5, "seed": 12345}'

# Get scenario for NPC
curl http://localhost:3001/scenario/<npc_id_from_init>

# List NPCs
curl http://localhost:3001/npcs
```

### 4.3 Test Python Client

```bash
cd python && PYTHONPATH=. python -c "
import asyncio
from src.training.simulation_bridge import SimulationBridge

async def test():
    async with SimulationBridge('http://localhost:3001') as bridge:
        health = await bridge.health_check()
        print(f'Health: {health}')
        
        await bridge.initialize(num_npcs=5)
        print(f'NPCs: {bridge.npc_ids}')
        
        scenario = await bridge.get_scenario(bridge.npc_ids[0])
        print(f'Scenario: {scenario.archetype}, Balance: {scenario.balance}')

asyncio.run(test())
"
```

### 4.4 Run Online Training

With bridge server running:
```bash
make train-online PROFILE=12gb
```

**Expected Output:**
- Connects to simulation bridge
- Generates scenarios from TypeScript
- Model generates responses
- Scores are computed
- Training step completes

---

## Phase 5: Large-Scale Data Generation

### 5.1 Configure API Keys

```bash
# Option A: Groq (faster, cheaper)
export GROQ_API_KEY="your-groq-key"

# Option B: OpenAI
export OPENAI_API_KEY="your-openai-key"
```

### 5.2 Generate Training Data

```bash
# 24 hours, 4 parallel workers, 20 NPCs each
./scripts/generate_dataset.sh 24 4 20 ./training-data

# Monitor progress
tail -f ./training-data/logs/worker_1.log
```

**Expected Output:**
- 4 parallel workers running
- ~500-2000 trajectories per worker
- Total: 2000-8000 trajectories

### 5.3 Merge and Validate Trajectories

```bash
cd python && python scripts/merge_trajectories.py ../training-data --validate

# Expected output:
# Total trajectories: 5000+
# Archetype distribution: trader 40%, degen 20%, ...
```

### 5.4 Import to Training Database

```bash
make db-up db-migrate
cd python && DATABASE_URL=postgresql://babylon_test:test_password@localhost:5434/babylon_test \
  python scripts/import_json_trajectories.py --source ../training-data/merged
```

---

## Phase 6: Cloud Deployment

### 6.1 Cloud Provider Setup

**RunPod (Recommended for L40s):**
1. Create account at runpod.io
2. Add payment method
3. Create pod with:
   - 1-4x L40 GPUs
   - 100GB+ disk
   - Ubuntu 22.04 + CUDA 12.1
   - Expose ports: 22, 8000, 9001

**Lambda Labs Alternative:**
1. Create account at lambdalabs.com
2. Request L40 access
3. Launch 4x L40 instance

### 6.2 Clone Repository on Cloud

```bash
# SSH into cloud instance
ssh root@<cloud-ip>

# Clone repo
git clone https://github.com/your-org/babs.git
cd babs/packages/training

# Install dependencies
apt-get update && apt-get install -y python3-venv docker.io docker-compose-plugin
curl -fsSL https://bun.sh/install | bash

# Setup Python
make venv
source python/venv/bin/activate
```

### 6.3 Configure Cloud Environment

```bash
# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://babylon_prod:securepassword@localhost:5432/babylon_prod
GROQ_API_KEY=your-groq-key
OPENAI_API_KEY=your-openai-key
WANDB_API_KEY=your-wandb-key
HF_TOKEN=your-huggingface-token
EOF

source .env
```

### 6.4 Start Production Database

```bash
# Start PostgreSQL
docker run -d --name babylon-postgres \
  -e POSTGRES_USER=babylon_prod \
  -e POSTGRES_PASSWORD=securepassword \
  -e POSTGRES_DB=babylon_prod \
  -p 5432:5432 \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:15

# Apply schema
cd ../db && DATABASE_URL=$DATABASE_URL bunx drizzle-kit push --force
```

### 6.5 Upload Training Data

From local machine:
```bash
# Compress merged data
cd training-data/merged
tar -czvf trajectories.tar.gz trajectories/

# Upload to cloud
scp trajectories.tar.gz root@<cloud-ip>:/root/babs/packages/training/

# On cloud, extract and import
ssh root@<cloud-ip>
cd /root/babs/packages/training
tar -xzvf trajectories.tar.gz
cd python && python scripts/import_json_trajectories.py --source ../merged
```

---

## Phase 7: Production Training Run

### 7.1 Single L40 Test Run

```bash
# Quick validation run (1 GPU)
cd packages/training
source python/venv/bin/activate

make train-l40 PROFILE=l40
```

**Expected Output:**
- vLLM loads Qwen 14B model
- Training starts
- ~1 step/minute throughput

### 7.2 Multi-GPU Training

For 4x L40 with Qwen3 30B:

```bash
# Set tensor parallel
export CUDA_VISIBLE_DEVICES=0,1,2,3

# Run with 4-GPU profile
make train-l40-4gpu
```

**Expected Config:**
- Model: Qwen/Qwen3-30B-A3B (or Qwen/Qwen2.5-32B-Instruct)
- Tensor parallel: 4
- Batch size: 16
- Total steps: 10000
- ~30 hours runtime

### 7.3 Monitor Training

```bash
# Watch logs
tail -f python/logs/training.log

# GPU utilization
watch -n 1 nvidia-smi

# W&B dashboard (if enabled)
# https://wandb.ai/your-org/babylon-rlaif
```

### 7.4 Checkpointing

Training saves checkpoints automatically:
```bash
ls python/trained_models/
# checkpoint-1000/
# checkpoint-2000/
# ...
```

Resume from checkpoint:
```bash
python scripts/run_training.py \
  --profile l40-4gpu \
  --resume python/trained_models/checkpoint-5000
```

---

## Phase 8: Evaluation & Export

### 8.1 Run Evaluation Suite

```bash
cd python && python -c "
from src.training import EvaluationSuite

suite = EvaluationSuite(generate_test_count=100)
print(suite.get_summary())
"
```

### 8.2 Generate Datasets from Rollouts

```bash
cd python && python -c "
from src.training import RolloutDumper
import os

dumper = RolloutDumper('./rollout_dumps')
print(dumper.get_stats())

# Generate SFT dataset
sft_path = dumper.generate_sft_dataset()
print(f'SFT dataset: {sft_path}')

# Generate DPO dataset
dpo_path = dumper.generate_dpo_dataset()
print(f'DPO dataset: {dpo_path}')
"
```

### 8.3 Export Final Model

```bash
# Copy best checkpoint
cp -r python/trained_models/checkpoint-best ./final-model

# Upload to HuggingFace
huggingface-cli login
python -c "
from transformers import AutoModelForCausalLM, AutoTokenizer
from huggingface_hub import HfApi

model = AutoModelForCausalLM.from_pretrained('./final-model')
tokenizer = AutoTokenizer.from_pretrained('./final-model')

model.push_to_hub('your-org/babylon-trader-v1')
tokenizer.push_to_hub('your-org/babylon-trader-v1')
"
```

---

## Validation Checklist

### Local Validation ✓
- [ ] `make tier1` passes
- [ ] `make tier2` passes
- [ ] `make tier3` passes (with Docker)
- [ ] `make tier4` passes (with GPU)
- [ ] Simulation bridge starts and responds
- [ ] `make train-online` completes 1 step

### Data Pipeline ✓
- [ ] `generate_dataset.sh` runs parallel workers
- [ ] `merge_trajectories.py` deduplicates correctly
- [ ] Trajectories import to database
- [ ] Archetype distribution looks correct

### Cloud Validation ✓
- [ ] Cloud instance has GPU access
- [ ] Repository clones and builds
- [ ] Database starts and migrates
- [ ] Training data uploads and imports
- [ ] Single-GPU training works
- [ ] Multi-GPU training works (if applicable)
- [ ] W&B logging works (if enabled)
- [ ] Checkpoints save correctly

### Quality Validation ✓
- [ ] Format compliance > 80%
- [ ] Valid action rate > 90%
- [ ] Thinking length avg 100-300 chars
- [ ] Score distribution has variance
- [ ] No NaN/Inf in losses
- [ ] KL divergence stays bounded

---

## Troubleshooting

### vLLM Won't Start
```bash
# Check CUDA
nvidia-smi

# Try smaller model
python scripts/run_training.py --profile cpu

# Clear cache
rm -rf ~/.cache/huggingface/hub/
```

### Database Connection Failed
```bash
# Check Docker
docker ps

# Reset database
make db-reset

# Test connection
docker exec -it babylon-test-postgres psql -U babylon_test -c "SELECT 1"
```

### Training Crashes OOM
```bash
# Reduce batch size in profile
# Edit python/config/profiles/12gb.json
{
  "batch_size": 1,
  "gradient_accumulation_steps": 8
}

# Or use smaller model
make train PROFILE=cpu
```

### Simulation Bridge Errors
```bash
# Check if bun is installed
which bun

# Check if port is free
lsof -i :3001

# Run with debug
DEBUG=* bun run src/services/simulation-bridge-server.ts
```

### Low Format Compliance
- Check system prompts in `online_env.py`
- Increase temperature (more exploration)
- Check if model was trained on chat format
- Review `format_validator.py` thresholds

---

## Estimated Timelines

| Task | Local (12GB) | Cloud (1x L40) | Cloud (4x L40) |
|------|--------------|----------------|----------------|
| Setup | 30 min | 1 hour | 1 hour |
| Tier 1-3 | 30 min | 30 min | 30 min |
| Tier 4 | 30 min | 15 min | 10 min |
| Data Gen (10K) | 24 hours | 12 hours | 6 hours |
| Train 1K steps | 8 hours | 2 hours | 30 min |
| Train 10K steps | 80 hours | 20 hours | 5 hours |
| Full Production | N/A | 48 hours | 12 hours |

---

## Next Steps After Validation

1. **Baseline Run**: Train with default settings, establish baseline metrics
2. **Hyperparameter Sweep**: Try different LR, KL coefficients, batch sizes
3. **Archetype Ablation**: Train separate models per archetype
4. **Online vs Offline**: Compare online bridge training vs offline database
5. **Scale Up**: Increase data, model size, training steps
6. **Evaluation**: Run on held-out test scenarios
7. **Deploy**: Push to production inference


