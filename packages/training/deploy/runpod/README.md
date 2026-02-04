# Babylon Training & Benchmark - RunPod

Deploy Babylon RL training and benchmarks to [RunPod](https://runpod.io) cloud GPUs.

## Quick Start

### Training

```bash
# 1. Set API key
export RUNPOD_API_KEY="your-key"  # from https://runpod.io/console/user/settings

# 2. Configure environment
cp ../env.example .env
# Edit .env with DATABASE_URL, WANDB_API_KEY, etc.

# 3. Start training
python setup.py train --gpu h100 --image yourorg/babylon-training:latest --env-file .env

# 4. Monitor
python setup.py list
python setup.py logs <pod-id>
```

### Benchmarking

```bash
# Benchmark a HuggingFace model (--base-model must match training!)
python setup.py benchmark \
  --gpu 4090 \
  --hf-model elizaos/gilgamesh-test-3060 \
  --base-model Qwen/Qwen2.5-0.5B-Instruct \
  --quick

# Use spot instance (cheaper)
python setup.py benchmark \
  --gpu 4090 \
  --hf-model elizaos/gilgamesh-test-3060 \
  --base-model Qwen/Qwen2.5-0.5B-Instruct \
  --spot --community
```

## Usage

### Using env file (recommended)

```bash
# Uses all settings from .env file
python setup.py train \
  --gpu h100 \
  --image yourorg/babylon-training:latest \
  --env-file .env
```

### Using CLI arguments

```bash
# Override specific settings
python setup.py train \
  --gpu h100 \
  --image yourorg/babylon-training:latest \
  --db "postgresql://..." \
  --wandb "your-wandb-key" \
  --steps 5000
```

### Spot instances (cheaper)

```bash
# Use spot instance (may be interrupted)
python setup.py train \
  --gpu 4090 \
  --image yourorg/babylon-training:latest \
  --env-file .env \
  --spot \
  --community
```

## Commands

```bash
# Start training pod
python setup.py train --gpu <type> --image <image> [options]

# Start benchmark pod
python setup.py benchmark --gpu <type> --hf-model <model> [options]

# List all pods
python setup.py list

# Stop and delete pod
python setup.py stop <pod-id>

# View logs (opens web console)
python setup.py logs <pod-id>
```

## GPU Options

| GPU | VRAM | ~$/hr | Best For |
|-----|------|-------|----------|
| `4090` | 24GB | $0.44 | Small models, budget |
| `l40s` | 48GB | $0.89 | Medium models |
| `a100` | 80GB | $1.99 | Large models |
| `h100` | 80GB | $3.99 | Fastest training |
| `h200` | 141GB | $4.99 | Largest models |

## Train Options

```
--gpu         GPU type (required): 4090, l40s, a100, h100, h200
--image       Docker image (required)
--env-file    Path to .env file (recommended)
--hf-dataset  HuggingFace dataset ID (recommended for cloud)
--name        Pod name (default: babylon-<gpu>)
--gpus        Number of GPUs (default: 1)
--steps       Training steps (default: from env or 1000)
--profile     Training profile (default: auto from GPU)
--min-agents-per-window  Min trajectories per window (default: 1)
--wandb       WANDB_API_KEY (overrides env file)
--hf-token    HF_TOKEN (overrides env file)
--spot        Use spot instance (cheaper, may interrupt)
--community   Use community cloud (cheaper)
```

## Benchmark Options

```
--gpu         GPU type (required): 4090, l40s, a100, h100, h200
--hf-model    HuggingFace model ID to benchmark (e.g., elizaos/gilgamesh-test-3060)
--base-model  Base model for vLLM (must match training, e.g., Qwen/Qwen2.5-0.5B-Instruct)
--model       Path to model inside container (alternative to --hf-model)
--image       Docker image (default: revlentless/babylon-benchmark:latest)
--env-file    Path to .env file
--name        Pod name (default: babylon-bench-<gpu>)
--hf-token    HF_TOKEN for private models
--quick       Quick mode - 7-day scenarios (faster)
--scenario    Specific scenario: bull-market, bear-market, scandal-unfolds, pump-and-dump
--spot        Use spot instance (cheaper, may interrupt)
--community   Use community cloud (cheaper)
```

## Environment Configuration

Uses the master [`../env.example`](../env.example). Key variables:

| Variable | Description |
|----------|-------------|
| `RUNPOD_API_KEY` | RunPod API access (required) |
| `HF_TOKEN` | Private model/dataset access (required for private repos) |
| `WANDB_API_KEY` | Experiment tracking |
| `HF_TRAJECTORY_DATASET` | HuggingFace dataset for training data |

### Data Source Note

**RunPod pods often cannot reach local/private databases.** Use `--hf-dataset` to load training data from HuggingFace instead:

```bash
python setup.py train \
  --gpu h100 \
  --image yourorg/babylon-training:latest \
  --env-file .env \
  --hf-dataset elizaos/enkidu-trajectories-raw
```

## Example Workflows

### Training Workflow

```bash
# 1. Build and push image
cd packages/training/deploy/docker
./build.sh training -o yourorg -t latest
./build.sh push-training -o yourorg -t latest

# 2. Configure
cp ../env.example .env
# Edit .env with HF_TOKEN, WANDB_API_KEY, RUNPOD_API_KEY

# 3. Deploy
cd ../runpod
python setup.py train --gpu h100 --image yourorg/babylon-training:latest --env-file ../.env

# 4. Monitor at https://runpod.io/console/pods

# 5. Clean up when done
python setup.py list
python setup.py stop <pod-id>
```

### Benchmark Workflow

```bash
# 1. Benchmark a trained model on HuggingFace
python setup.py benchmark \
  --gpu 4090 \
  --hf-model elizaos/gilgamesh-test-3060 \
  --base-model Qwen/Qwen2.5-0.5B-Instruct \
  --quick

# 2. Run full benchmark suite (all scenarios)
python setup.py benchmark \
  --gpu h100 \
  --hf-model elizaos/gilgamesh-test-h100 \
  --base-model Qwen/Qwen2.5-14B-Instruct

# 3. Run specific scenario
python setup.py benchmark \
  --gpu 4090 \
  --hf-model elizaos/gilgamesh-test-3060 \
  --base-model Qwen/Qwen2.5-0.5B-Instruct \
  --scenario bear-market \
  --spot

# 4. Monitor and clean up
python setup.py list
python setup.py stop <pod-id>
```

## Troubleshooting

### Pod won't start

- Check image exists and is accessible
- Verify GPU type is available
- Check RunPod console for error messages

### Training fails

- SSH into pod or check logs in console
- Verify DATABASE_URL is accessible from RunPod
- Check CUDA/GPU availability

### Benchmark fails

- Ensure HF_TOKEN is set for private models
- Check that the model exists on HuggingFace
- Verify GPU has enough VRAM for the model
- Check vLLM logs in the pod console

## Benchmark Scenarios

| Scenario | Duration | Condition | Tests |
|----------|----------|-----------|-------|
| `bull-market` | 22 days | Bull | Basic competence |
| `bear-market` | 22 days | Bear | Capital protection |
| `scandal-unfolds` | 22 days | Scandal | Information processing |
| `pump-and-dump` | 22 days | Volatile | Skepticism |

## Related

- [Master Environment Config](../env.example)
- [Docker Images](../docker/README.md)
- [Local Development](../local/README.md)
- [Phala Cloud (TEE)](../phala/README.md)
