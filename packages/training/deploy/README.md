# Babylon RL Training - Deployment

This directory contains everything needed to deploy Babylon RL training to various platforms.

## Quick Start

```bash
# 1. Copy and configure environment
cp env.example .env
# Edit .env with your DATABASE_URL, etc.

# 2. Build and push Docker images
cd docker
./build.sh all -t 0.2.0,latest

# 3. Run locally
cd ../local
./run.sh --profile 12gb --steps 100
```

## Directory Structure

```
deploy/
├── env.example       # Master environment config (copy to .env)
├── README.md         # This file
├── docker/           # Docker images
│   ├── Dockerfile.base   # Base image with vLLM + FlashInfer
│   ├── Dockerfile        # Production image
│   ├── build.sh          # Build/push CLI
│   ├── scripts/          # Container scripts
│   └── README.md
├── local/            # Local development scripts
│   ├── run.sh            # Quick local training
│   └── README.md
├── runpod/           # RunPod cloud deployment
│   ├── setup.py          # CLI for RunPod pods
│   └── README.md
```

## Deployment Options

| Platform | GPU Support | Best For | Setup Time |
|----------|-------------|----------|------------|
| **Local Docker** | Your GPU | Development, testing | 5 min |
| **RunPod** | RTX 4090, A100, H100, H200 | Production training | 10 min |

## Environment Configuration

All platforms use the same environment variables. See [`env.example`](./env.example) for the complete list.

**Required:**
- `DATABASE_URL` - PostgreSQL with trajectory data

**Recommended:**
- `WANDB_API_KEY` - Experiment tracking
- `HF_TOKEN` - For private/gated models

## GPU Profiles

The training supports various GPU configurations:

| Profile | GPU | VRAM | Model | Use Case |
|---------|-----|------|-------|----------|
| `12gb` | RTX 3060/4070 | 12GB | Qwen2.5-0.5B | Local dev |
| `24gb` | RTX 3090/4090 | 24GB | Qwen2.5-1.5B | Local/Cloud |
| `l40` | L40S | 48GB | Qwen2.5-7B | Cloud |
| `a100` | A100 | 80GB | Qwen2.5-14B | Production |
| `h100` | H100 | 80GB | Qwen3-30B-A3B | Production |

## Docker Images

We use a **two-stage build** for faster iteration:

1. **Base Image** (`Dockerfile.base`) - Built once, ~10 min
   - Uses official `vllm/vllm-openai:v0.14.0`
   - Includes FlashInfer attention (no flash-attn compilation!)
   - All ML dependencies pre-installed

2. **Training Image** (`Dockerfile`) - Built per-change, ~2 min
   - Extends base image
   - Adds your training code
   - Optionally pre-downloads model weights

```bash
cd docker

# Build and push everything
./build.sh all -t 0.2.0,latest

# Or step by step
./build.sh base -t 0.2.0,latest
./build.sh push-base -t 0.2.0,latest
./build.sh training -t 0.2.0,latest
./build.sh push-training -t 0.2.0,latest

# Different org
./build.sh all -o myorg -t 1.0.0
```

## Platform Guides

- **[Local Development](./local/README.md)** - Run training on your local GPU
- **[Docker](./docker/README.md)** - Building and configuring images
- **[RunPod](./runpod/README.md)** - Cloud GPU training
