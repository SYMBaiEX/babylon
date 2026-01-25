# Babylon Training - RunPod

Deploy Babylon RL training to [RunPod](https://runpod.io) cloud GPUs.

## Quick Start

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
--name        Pod name (default: babylon-<gpu>)
--gpus        Number of GPUs (default: 1)
--steps       Training steps (default: from env or 1000)
--profile     Training profile (default: auto from GPU)
--db          DATABASE_URL (overrides env file)
--wandb       WANDB_API_KEY (overrides env file)
--hf-token    HF_TOKEN (overrides env file)
--spot        Use spot instance (cheaper, may interrupt)
--community   Use community cloud (cheaper)
```

## Environment Configuration

Uses the master [`../env.example`](../env.example). Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL with trajectory data |
| `WANDB_API_KEY` | Experiment tracking |
| `RUNPOD_API_KEY` | RunPod API access |
| `HF_TOKEN` | Private model access |

## Example Workflow

```bash
# 1. Build and push image
cd packages/training
docker build -f deploy/docker/Dockerfile -t yourorg/babylon-training:latest .
docker push yourorg/babylon-training:latest

# 2. Configure
cp deploy/env.example deploy/runpod/.env
# Edit .env

# 3. Deploy
cd deploy/runpod
python setup.py train --gpu h100 --image yourorg/babylon-training:latest --env-file .env

# 4. Monitor at https://runpod.io/console/pods

# 5. Clean up when done
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

## Related

- [Master Environment Config](../env.example)
- [Docker Images](../docker/README.md)
- [Phala Cloud (TEE)](../phala/README.md)
