#!/bin/bash
#
# RunPod Setup Script for Babylon Training (Improved)
# 
# This script sets up a RunPod instance for training.
# Estimated time: ~10-15 minutes (vs 2+ hours previously)
#
# Usage:
#   1. SSH into your RunPod instance
#   2. Clone the repo: git clone https://github.com/BabylonSocial/babylon.git bab
#   3. Run: bash bab/packages/training/scripts/runpod_setup.sh
#
# Prerequisites:
#   - RunPod instance with H100/A100/L40 GPUs
#   - DATABASE_URL set (Supabase direct connection - port 5432, NOT 6543)
#
# IMPORTANT: Use Supabase DIRECT connection, not pooler!
#   ❌ WRONG: postgresql://...@pooler.supabase.com:6543/...
#   ✓ RIGHT: postgresql://...@db.xxx.supabase.co:5432/...
#

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

echo -e "${CYAN}======================================${RESET}"
echo -e "${CYAN}  Babylon Training - RunPod Setup    ${RESET}"
echo -e "${CYAN}======================================${RESET}"
echo ""

# Detect script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$TRAINING_DIR/../.." && pwd)"

cd "$TRAINING_DIR"
echo -e "Working directory: ${GREEN}$TRAINING_DIR${RESET}"
echo ""

# ============================================================================
# Step 1: Check GPU availability
# ============================================================================
echo -e "${CYAN}[1/8] Checking GPU availability...${RESET}"
if command -v nvidia-smi &> /dev/null; then
    GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader | wc -l)
    echo -e "${GREEN}✓ Found $GPU_COUNT GPU(s):${RESET}"
    nvidia-smi --query-gpu=index,name,memory.total --format=csv
else
    echo -e "${RED}✗ nvidia-smi not found. GPU drivers not installed?${RESET}"
    exit 1
fi
echo ""

# ============================================================================
# Step 2: Check DATABASE_URL
# ============================================================================
echo -e "${CYAN}[2/8] Checking database configuration...${RESET}"
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠ DATABASE_URL not set${RESET}"
    echo ""
    echo "Please set DATABASE_URL to your Supabase DIRECT connection:"
    echo ""
    echo "  export DATABASE_URL='postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres'"
    echo ""
    echo -e "${RED}IMPORTANT: Use port 5432 (direct), NOT 6543 (pooler)${RESET}"
    echo ""
    read -p "Continue without database? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        exit 1
    fi
else
    # Check for pooler connection (common mistake)
    if [[ "$DATABASE_URL" == *"pooler.supabase.com"* ]] || [[ "$DATABASE_URL" == *":6543"* ]]; then
        echo -e "${RED}⚠ WARNING: Detected Supabase pooler connection (port 6543)${RESET}"
        echo ""
        echo "The training code uses asyncpg which DOES NOT work with Supabase's pooler."
        echo "Please use the DIRECT connection instead:"
        echo ""
        echo "  Settings → Database → Connection string → URI (not Pooler)"
        echo "  Should use port 5432, not 6543"
        echo ""
        read -p "Continue anyway? (not recommended) (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✓ DATABASE_URL is set (looks like direct connection)${RESET}"
    fi
fi
echo ""

# ============================================================================
# Step 3: Install system dependencies
# ============================================================================
echo -e "${CYAN}[3/8] Installing system dependencies...${RESET}"
apt-get update -qq 2>/dev/null || true
apt-get install -y -qq python3.11 python3.11-venv python3-pip curl git postgresql-client 2>/dev/null || {
    echo -e "${YELLOW}⚠ Some apt packages failed (may be OK in container)${RESET}"
}
echo -e "${GREEN}✓ System dependencies checked${RESET}"
echo ""

# ============================================================================
# Step 4: Install Bun (for database migrations)
# ============================================================================
echo -e "${CYAN}[4/8] Installing Bun...${RESET}"
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
fi
echo -e "${GREEN}✓ Bun installed: $(bun --version)${RESET}"
echo ""

# ============================================================================
# Step 5: Create Python virtual environment
# ============================================================================
echo -e "${CYAN}[5/8] Setting up Python virtual environment...${RESET}"
cd python
if [ ! -d "venv" ]; then
    python3.11 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip -q
echo -e "${GREEN}✓ Virtual environment activated${RESET}"
echo ""

# ============================================================================
# Step 6: Install Python dependencies
# ============================================================================
echo -e "${CYAN}[6/8] Installing Python dependencies...${RESET}"
echo "  This may take 5-10 minutes..."

# Core requirements
pip install -r requirements.txt -q

# GPU training packages
pip install torch>=2.1.0 --index-url https://download.pytorch.org/whl/cu121 -q
pip install transformers>=4.36.0 peft>=0.8.0 accelerate>=1.12.0 -q

# vLLM (large package)
echo "  Installing vLLM (this takes a while)..."
pip install vllm>=0.4.0 -q

# atroposlib
pip install atroposlib -q

# Install local package
pip install -e . -q

echo -e "${GREEN}✓ Python dependencies installed${RESET}"
echo ""

# ============================================================================
# Step 7: Try to install flash-attention (optional)
# ============================================================================
echo -e "${CYAN}[7/8] Installing flash-attention (optional, may take 10+ min)...${RESET}"
echo "  If this fails, training will still work but may be slower."
pip install flash-attn --no-build-isolation -q 2>/dev/null && \
    echo -e "${GREEN}✓ Flash attention installed${RESET}" || \
    echo -e "${YELLOW}⚠ Flash attention not available (optional, continuing)${RESET}"
echo ""

# ============================================================================
# Step 8: Verify installation
# ============================================================================
echo -e "${CYAN}[8/8] Verifying installation...${RESET}"
python -c "
import torch
import vllm
print(f'  PyTorch: {torch.__version__}')
print(f'  CUDA available: {torch.cuda.is_available()}')
print(f'  GPU count: {torch.cuda.device_count()}')
for i in range(torch.cuda.device_count()):
    props = torch.cuda.get_device_properties(i)
    print(f'    GPU {i}: {props.name} ({props.total_memory / 1e9:.1f} GB)')
print(f'  vLLM: {vllm.__version__}')

try:
    import flash_attn
    print(f'  Flash Attention: {flash_attn.__version__}')
except ImportError:
    print('  Flash Attention: Not available')
"

# Test database connection if available
if [ -n "$DATABASE_URL" ]; then
    echo ""
    echo "  Testing database connection..."
    python -c "
import os
import asyncio
import asyncpg

async def test():
    try:
        pool = await asyncpg.create_pool(
            os.environ['DATABASE_URL'],
            min_size=1, max_size=1,
            statement_cache_size=0,
            command_timeout=10
        )
        async with pool.acquire() as conn:
            count = await conn.fetchval('SELECT COUNT(*) FROM trajectories WHERE \"isTrainingData\" = true')
            print(f'  ✓ Database connected! Training trajectories: {count}')
        await pool.close()
    except Exception as e:
        print(f'  ⚠ Database connection failed: {e}')

asyncio.run(test())
"
fi

echo -e "${GREEN}✓ Installation verified${RESET}"
echo ""

# ============================================================================
# Done!
# ============================================================================
echo -e "${GREEN}======================================${RESET}"
echo -e "${GREEN}  Setup Complete!                     ${RESET}"
echo -e "${GREEN}======================================${RESET}"
echo ""
echo -e "Environment is ready. Next steps:"
echo ""
echo -e "  ${CYAN}# Activate environment (if not already)${RESET}"
echo -e "  cd $TRAINING_DIR/python && source venv/bin/activate"
echo ""
echo -e "  ${CYAN}# Quick validation (1 step)${RESET}"
echo -e "  python scripts/run_training.py --profile h100-4gpu --steps 1 --skip-validation --no-wandb"
echo ""
echo -e "  ${CYAN}# Full training run${RESET}"
echo -e "  python scripts/run_training.py --profile h100-4gpu --steps 5000"
echo ""
echo -e "  ${CYAN}# If trajectories aren't being found, increase lookback:${RESET}"
echo -e "  python scripts/run_training.py --profile h100-4gpu --lookback-hours 720"
echo ""
echo -e "${YELLOW}TIP: If training seems to 'hang', check:${RESET}"
echo -e "  1. DATABASE_URL uses port 5432 (direct), not 6543 (pooler)"
echo -e "  2. Trajectories exist in database (check logs for count)"
echo -e "  3. Lookback window is large enough for your data"
echo ""
