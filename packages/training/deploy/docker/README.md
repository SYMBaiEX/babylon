# Babylon Training - Docker

Production Docker images for Babylon RL training with GPU support.

## Build Strategy

We use a **two-stage build** for fast iteration:

| Image | Base | Build Time | Purpose |
|-------|------|------------|---------|
| `Dockerfile.base` | `vllm/vllm-openai:v0.14.0` | ~10 min | vLLM + FlashInfer + ML deps |
| `Dockerfile` | Your base image | ~2 min | Training code |

**Workflow:**
1. Build `Dockerfile.base` once and push to registry
2. Use `Dockerfile` for fast builds during development

## Quick Start

### Using build.sh (recommended)

```bash
cd packages/training/deploy/docker

# Build and push everything
./build.sh all -t 0.2.0,latest

# Or step by step
./build.sh base -t 0.2.0,latest       # Build base image
./build.sh push-base -t 0.2.0,latest  # Push base image
./build.sh training -t 0.2.0,latest   # Build training image
./build.sh push-training -t 0.2.0,latest  # Push training image

# With different org
./build.sh all -o myorg -t 0.2.0,latest
```

### Manual commands

```bash
cd packages/training

# Step 1: Build base image (do once)
docker build -f deploy/docker/Dockerfile.base -t yourorg/babylon-base:0.2.0 .
docker push yourorg/babylon-base:0.2.0

# Step 2: Build training image (fast)
docker build -f deploy/docker/Dockerfile \
  --build-arg BASE_IMAGE=yourorg/babylon-base:0.2.0 \
  -t babylon-training .

# Step 3: Run
docker run --gpus all --network host \
  --env-file deploy/.env \
  -v $(pwd)/trained_models:/app/trained_models \
  babylon-training \
  python3 python/scripts/run_training.py --profile 12gb --steps 100
```

## Why vLLM's Official Image?

The `vllm/vllm-openai:v0.14.0` base image provides:

- ✅ **FlashInfer** attention backend built-in (no compilation!)
- ✅ PyTorch with CUDA support
- ✅ vLLM inference server
- ✅ Guaranteed compatibility

**Old approach problems we avoided:**
- ❌ 45+ minute flash-attn compilation
- ❌ ABI compatibility issues
- ❌ Memory crashes during builds

## Running

### Using env file (recommended)

```bash
# Copy and configure
cp deploy/env.example deploy/.env
# Edit .env with your settings

# Run with env file
docker run --gpus all --network host \
  --env-file deploy/.env \
  -v $(pwd)/trained_models:/app/trained_models \
  babylon-training \
  python3 python/scripts/run_training.py --profile 12gb --steps 100
```

### With explicit environment variables

```bash
docker run --gpus all --network host \
  -e DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
  -e WANDB_API_KEY="your-key" \
  -e WANDB_MODE="online" \
  babylon-training \
  python3 python/scripts/run_training.py --profile h100 --steps 5000
```

### Interactive shell

```bash
docker run --gpus all --network host -it \
  --env-file deploy/.env \
  babylon-training bash
```

## Pre-downloading Models

Pre-download model weights to speed up first run (increases image size):

```bash
docker build -f deploy/docker/Dockerfile \
  --build-arg BASE_IMAGE=yourorg/babylon-base:0.2.0 \
  --build-arg PRELOAD_MODEL=Qwen/Qwen2.5-0.5B-Instruct \
  -t babylon-training:with-model .
```

## Build Script

The `build.sh` script simplifies building and pushing images.

### Commands

| Command | Description |
|---------|-------------|
| `base` | Build base image |
| `training` | Build training image |
| `push-base` | Push base image |
| `push-training` | Push training image |
| `all` | Build and push everything |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --org` | Docker registry org | `revlentless` |
| `-t, --tags` | Comma-separated tags | `latest` |
| `-b, --base-tag` | Base image tag for training | `latest` |

### Examples

```bash
# Build and push with version tags
./build.sh all -t 0.2.0,latest

# Different organization
./build.sh all -o myorg -t 1.0.0

# Build training with specific base version
./build.sh training -b 0.2.0 -t 0.3.0
```

## Push to Registry

Using build.sh (recommended):
```bash
./build.sh push-base -t 0.2.0,latest
./build.sh push-training -t 0.2.0,latest
```

Manual:
```bash
# DockerHub
docker push yourorg/babylon-training:latest

# GitHub Container Registry
docker tag babylon-training ghcr.io/yourorg/babylon-training:latest
docker push ghcr.io/yourorg/babylon-training:latest
```

## Environment Variables

See [`../env.example`](../env.example) for the complete list.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `WANDB_API_KEY` | No | Weights & Biases API key |
| `WANDB_MODE` | No | `online`, `offline`, or `disabled` |
| `HF_TOKEN` | No | HuggingFace token for private models |
| `VLLM_ATTENTION_BACKEND` | No | `FLASHINFER` (default) or `FLASH_ATTN` |

## Container Scripts

### `entrypoint.sh`

Runs on container startup:
- Checks GPU availability
- Verifies Python packages
- Tests database connection
- Reports attention backend
- Executes your command

### `validate.sh`

Quick environment validation (optional):
```bash
docker run --gpus all babylon-training /app/scripts/validate.sh
```

## Image Details

- **Base**: `vllm/vllm-openai:v0.14.0`
- **Python**: 3.12
- **vLLM**: 0.14.0 with FlashInfer
- **Training**: transformers, peft, accelerate, atroposlib

## Troubleshooting

### GPU Not Detected

Ensure NVIDIA Container Toolkit is installed:

```bash
# Test GPU access
docker run --gpus all nvidia/cuda:12.1.0-base nvidia-smi
```

### vLLM Crashes with Segfault

This usually means attention backend issues. The service manager now:
1. Uses `--enforce-eager` by default (safer)
2. Uses `FLASHINFER` backend (no external deps)

If you still have issues:
```bash
docker run --gpus all -e VLLM_ATTENTION_BACKEND=FLASHINFER ...
```

### Database Connection Failed

Check your `DATABASE_URL` format:
```
postgresql://user:password@host:port/database
```

**Note:** Don't quote values in `.env` files used with `--env-file`.

### Build Context Too Large

Ensure `.dockerignore` exists and excludes:
- `.venv/`, `venv/`
- `logs/`, `trained_models/`
- `__pycache__/`, `*.pyc`
