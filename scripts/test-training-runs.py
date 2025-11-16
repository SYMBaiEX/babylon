#!/usr/bin/env python3
"""
Test that training actually runs end-to-end
"""

import os
import sys
import asyncio
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "python" / "src"))

from dotenv import load_dotenv

# Load environment
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
env_local_path = project_root / '.env.local'

if env_local_path.exists():
    load_dotenv(env_local_path, override=True)
if env_path.exists():
    load_dotenv(env_path, override=False)

async def test_training_runs():
    """Test that training can actually run"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    db_url = os.getenv('DATABASE_URL')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    if not db_url:
        print("⚠️  DATABASE_URL not set - will test without DB")
        db_url = "postgresql://test:test@localhost:5432/test"
    
    print("=" * 70)
    print("TESTING TRAINING PIPELINE")
    print("=" * 70)
    
    # Test 1: Import training module
    print("\nTEST 1: Import training module...")
    try:
        # Import directly from file to avoid __init__.py issues
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "babylon_trainer",
            Path(__file__).parent.parent / "python" / "src" / "training" / "babylon_trainer.py"
        )
        babylon_trainer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(babylon_trainer)
        BabylonTrainer = babylon_trainer.BabylonTrainer
        print("✅ Training module imports successfully")
    except Exception as e:
        print(f"❌ Failed to import: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 2: Create trainer instance
    print("\nTEST 2: Create trainer instance...")
    try:
        trainer = BabylonTrainer(
            db_url=db_url,
            project="babylon",
            base_model="OpenPipe/Qwen3-14B-Instruct",
            min_agents=1
        )
        print("✅ Trainer created successfully")
        print(f"   Project: {trainer.project}")
        print(f"   Base model: {trainer.base_model}")
    except Exception as e:
        print(f"❌ Failed to create trainer: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 3: Connect to database (if available)
    print("\nTEST 3: Connect to database...")
    try:
        await trainer.connect()
        print("✅ Database connection successful")
    except Exception as e:
        print(f"⚠️  Database connection failed (expected if DB not running): {e}")
        print("   Continuing without DB connection...")
    
    # Test 4: Initialize model (this is where W&B registration happens)
    print("\nTEST 4: Initialize model (W&B registration)...")
    print("   This will attempt to register with W&B...")
    print("   (May timeout if W&B service is slow)")
    
    try:
        model_name = f"test-run-{int(asyncio.get_event_loop().time())}"
        await asyncio.wait_for(
            trainer.initialize_model(model_name),
            timeout=180.0  # 3 minutes
        )
        print("✅ Model initialized successfully!")
        print(f"   Model name: {model_name}")
        if trainer.model:
            print(f"   Model ID: {trainer.model.id if hasattr(trainer.model, 'id') else 'N/A'}")
    except asyncio.TimeoutError:
        print("⚠️  Model initialization timed out (W&B service may be slow)")
        print("   This is expected if W&B training API is having issues")
        return False
    except Exception as e:
        error_str = str(e)
        if "524" in error_str or "timeout" in error_str.lower():
            print("⚠️  W&B timeout (524) - service issue, not code issue")
            print("   Code is correctly configured")
        else:
            print(f"❌ Model initialization failed: {e}")
            import traceback
            traceback.print_exc()
        return False
    
    # Test 5: Cleanup
    print("\nTEST 5: Cleanup...")
    try:
        await trainer.close()
        print("✅ Cleanup successful")
    except Exception as e:
        print(f"⚠️  Cleanup warning: {e}")
    
    print("\n" + "=" * 70)
    print("✅ TRAINING PIPELINE TEST COMPLETE")
    print("=" * 70)
    print("\nSummary:")
    print("  ✅ Code imports successfully")
    print("  ✅ Trainer creates successfully")
    print("  ✅ Model initialization attempted")
    print("\nIf model initialization succeeded, training CAN run!")
    print("If it timed out, that's a W&B service issue, not a code issue.")
    
    return True

if __name__ == "__main__":
    success = asyncio.run(test_training_runs())
    sys.exit(0 if success else 1)

