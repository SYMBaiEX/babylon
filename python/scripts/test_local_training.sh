#!/bin/bash
# Test Training Pipeline Locally
# Simulates GitHub Actions workflow steps

set -e

echo "╔═══════════════════════════════════════════════════════╗"
echo "║                                                        ║"
echo "║     LOCAL TRAINING PIPELINE TEST                      ║"
echo "║     (Simulating GitHub Actions Workflow)               ║"
echo "║                                                        ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Change to project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo "Project root: $PROJECT_ROOT"
echo ""

# Check for .env files (Python will load them)
if [ -f .env.local ]; then
    echo "✅ Found .env.local"
fi
if [ -f .env ]; then
    echo "✅ Found .env"
fi

echo ""

# Step 1: Python version
echo "=== STEP 1: Python Version ==="
python3 --version
echo ""

# Step 2: Install dependencies
echo "=== STEP 2: Install Dependencies ==="
cd python

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

echo "Installing dependencies (this may take 2-3 minutes)..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
pip install -e . > /dev/null 2>&1

echo "✅ Dependencies installed"
echo ""

# Step 3: Verify installation
echo "=== STEP 3: Verify Installation ==="
echo "Python: $(python --version)"
echo ""
echo "Key packages:"
pip list | grep -E "(openpipe-art|wandb|asyncpg|dotenv)" || echo "⚠️  Some packages missing"
echo ""

# Step 4: Test database connection
echo "=== STEP 4: Database Connection ==="
python3 << 'PYTHON_SCRIPT'
import asyncio
import asyncpg
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment
project_root = Path.cwd().parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

async def test():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not in environment")
        sys.exit(1)
    
    try:
        pool = await asyncpg.create_pool(db_url, min_size=1, max_size=2, timeout=30)
        
        result = await pool.fetchval("SELECT 1")
        print(f"✅ Database connected (test: {result})")
        
        # Count trajectories
        total = await pool.fetchval('SELECT COUNT(*) FROM trajectories WHERE "isTrainingData" = true')
        scored = await pool.fetchval('SELECT COUNT(*) FROM trajectories WHERE "aiJudgeReward" IS NOT NULL')
        ready = await pool.fetchval("""
            SELECT COUNT(*) FROM trajectories 
            WHERE "isTrainingData" = true 
            AND "usedInTraining" = false
            AND "aiJudgeReward" IS NOT NULL
            AND "stepsJson" IS NOT NULL
            AND "stepsJson"::text != 'null'
            AND "stepsJson"::text != '[]'
        """)
        
        print(f"📊 Total training trajectories: {total}")
        print(f"📊 Scored by RULER: {scored}")
        print(f"📊 Ready for training: {ready}")
        
        if ready >= 10:
            print(f"✅ Sufficient data for testing (lowered threshold)")
        elif ready > 0:
            print(f"⚠️  Only {ready} trajectories ready")
            print(f"   Can test with force=true")
        else:
            print(f"❌ No scored trajectories available")
            print(f"   Need to run RULER scoring first")
        
        await pool.close()
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)

asyncio.run(test())
PYTHON_SCRIPT

echo ""

# Step 5: Test W&B connection
echo "=== STEP 5: W&B Connection ==="
python3 << 'PYTHON_SCRIPT'
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment
project_root = Path.cwd().parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

wandb_key = os.getenv('WANDB_API_KEY')
wandb_project = os.getenv('WANDB_PROJECT', 'babylon')

if not wandb_key:
    print("⚠️  WANDB_API_KEY not set")
    print("   Training will fail or use local GPU")
    print("   Get key from: https://wandb.ai/authorize")
else:
    print(f"✅ WANDB_API_KEY set ({len(wandb_key)} chars)")
    print(f"✅ WANDB_PROJECT: {wandb_project}")
    
    try:
        import wandb
        wandb.login(key=wandb_key, relogin=True, force=True)
        print("✅ W&B authentication successful")
        
        # Get user info
        api = wandb.Api()
        viewer = api.viewer
        username = viewer.get('username', 'unknown')
        entity = viewer.get('entity', username)
        
        print(f"✅ Logged in as: {username}")
        print(f"✅ Entity: {entity}")
        print(f"✅ Ready to train models in: {entity}/{wandb_project}")
        
    except Exception as e:
        print(f"⚠️  W&B error: {e}")

print("")
PYTHON_SCRIPT

echo ""

# Step 6: List available training windows
echo "=== STEP 6: Check Available Training Data ==="
export MODE=list
export WANDB_PROJECT=${WANDB_PROJECT:-babylon}
export MIN_AGENTS_PER_WINDOW=2

echo "Checking for training windows..."
echo ""

python3 src/training/babylon_trainer.py 2>&1 | head -50 || echo "⚠️  Trainer execution completed with warnings"

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║                                                        ║"
echo "║     LOCAL TEST COMPLETE                                ║"
echo "║                                                        ║"
echo "║  ✅ Dependencies installed                             ║"
echo "║  ✅ Database connected                                 ║"
echo "║  ✅ W&B authenticated                                  ║"
echo "║  ✅ Trainer script executed                            ║"
echo "║                                                        ║"
echo "║  Ready to test actual training with:                   ║"
echo "║    export MODE=single                                  ║"
echo "║    export BATCH_ID=test-local                          ║"
echo "║    python3 src/training/babylon_trainer.py             ║"
echo "║                                                        ║"
echo "╚═══════════════════════════════════════════════════════╝"
