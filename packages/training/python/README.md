# Babylon RL Training

Complete continuous RL training using ART framework with ServerlessBackend.

---

## Quick Start

```bash
# Install
pip install openpipe-art==0.5.1 asyncpg python-dotenv

# Configure
export DATABASE_URL=postgresql://your-db-url
export WANDB_API_KEY=your-key  # REQUIRED - Get from https://wandb.ai/settings

# Migrate
psql $DATABASE_URL -f migrations/002_add_self_hosted_tables.sql

# Train!
python -m src.training.babylon_trainer
```

**Important:** `WANDB_API_KEY` is **REQUIRED**. ServerlessBackend only supports W&B remote training (no local GPU fallback).

---

## Two Trainers Available

### 1. Original Trainer (Recommended)
```bash
python -m src.training.trainer --min-agents 3
```
- Production-tested
- Complete ART+RULER implementation
- Requires WANDB_API_KEY for remote training

### 2. New Simplified Trainer
```bash
python -m src.training.babylon_trainer  
```
- ServerlessBackend pattern
- Local scoring (no OpenPipe)
- Requires WANDB_API_KEY for remote training

---

## Files

- `src/training/trainer.py` - Original (recommended)
- `src/training/babylon_trainer.py` - Simplified
- `migrations/002_add_self_hosted_tables.sql` - Database schema
- `requirements.txt` - Dependencies

---

## Documentation

See [../RL_TRAINING_README.md](../RL_TRAINING_README.md) for complete guide.

---

**Status**: ✅ Production ready

**Run**: `python -m src.training.trainer --min-agents 3`
