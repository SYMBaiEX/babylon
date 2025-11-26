#!/usr/bin/env python3
"""
Quick local training test script

This script validates that the ART framework is correctly configured
and can run local training with a small model.

Usage:
    # Quick test with smallest model (Qwen 3B)
    python python/scripts/test_local_training.py

    # Test with 7B model
    BASE_MODEL=Qwen/Qwen2.5-7B-Instruct python python/scripts/test_local_training.py

    # Test with specific window
    WINDOW_ID=2025-01-15T12:00 python python/scripts/test_local_training.py

Environment variables:
    USE_LOCAL_BACKEND: Set to "true" for local GPU training (default: true)
    BASE_MODEL: Model to use (default: Qwen/Qwen2.5-3B-Instruct for local)
    DATABASE_URL: PostgreSQL connection string (required)
    MAX_EXAMPLES: Maximum trajectories to load (default: 100 for testing)
    MAX_STEPS_PER_TRAJECTORY: Steps per trajectory (default: 10 for testing)
    WINDOW_ID: Specific window to train on (optional)
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "python" / "src"))

# Set defaults for quick testing
os.environ.setdefault("USE_LOCAL_BACKEND", "true")
os.environ.setdefault("BASE_MODEL", "Qwen/Qwen2.5-3B-Instruct")  # Smallest model
os.environ.setdefault("MAX_EXAMPLES", "100")  # Small dataset for testing
os.environ.setdefault("MAX_STEPS_PER_TRAJECTORY", "10")  # Short sequences
os.environ.setdefault("MAX_SEQ_LENGTH", "4096")  # Reduced context for speed
os.environ.setdefault("MIN_AGENTS_PER_WINDOW", "1")


async def main():
    print("=" * 70)
    print("🧪 LOCAL TRAINING TEST")
    print("=" * 70)
    
    # Check prerequisites
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL not set")
        print("   Set with: export DATABASE_URL=postgresql://...")
        sys.exit(1)
    
    # Check GPU
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            print(f"✅ GPU: {gpu_name} ({gpu_memory:.1f}GB)")
        else:
            print("⚠️  No CUDA GPU - training will be SLOW")
    except ImportError:
        print("⚠️  PyTorch not installed - cannot check GPU")
    
    # Check ART installation
    try:
        import art
        print(f"✅ ART version: {art.__version__ if hasattr(art, '__version__') else 'installed'}")
    except ImportError:
        print("❌ ART not installed")
        print("   Install with: pip install openpipe-art")
        sys.exit(1)
    
    print(f"\n📝 Configuration:")
    print(f"   USE_LOCAL_BACKEND: {os.getenv('USE_LOCAL_BACKEND')}")
    print(f"   BASE_MODEL: {os.getenv('BASE_MODEL')}")
    print(f"   MAX_EXAMPLES: {os.getenv('MAX_EXAMPLES')}")
    print(f"   MAX_SEQ_LENGTH: {os.getenv('MAX_SEQ_LENGTH')}")
    
    # Import trainer
    from training.babylon_trainer import BabylonTrainer
    
    # Create trainer
    trainer = BabylonTrainer(
        db_url=db_url,
        project="babylon-test",
        min_agents=1,
        use_local_backend=True,
    )
    
    await trainer.connect()
    
    try:
        # Find a window with data
        window_id = os.getenv("WINDOW_ID")
        
        if not window_id:
            print("\n🔍 Looking for windows with data...")
            for hours_ago in range(2, 72):
                wid = trainer.get_window_id(hours_ago)
                data = await trainer.collect_window_data(wid)
                if data['count'] >= 1:
                    window_id = wid
                    print(f"   Found: {window_id} ({data['count']} agents)")
                    break
        
        if not window_id:
            print("\n⚠️  No windows with trajectory data found")
            print("   The test will verify the setup but skip training")
            
            # Just verify model initialization
            print("\n🔧 Testing model initialization...")
            await trainer.initialize_model("test-model")
            print("✅ Model initialized successfully!")
            print("\n💡 Add some trajectory data to test actual training")
            return
        
        print(f"\n🚀 Training on window: {window_id}")
        
        result = await trainer.train_window(
            window_id,
            batch_id=f"test-{int(asyncio.get_event_loop().time())}",
            model_version="test"
        )
        
        print("\n" + "=" * 70)
        print("✅ LOCAL TRAINING TEST PASSED")
        print("=" * 70)
        print(f"Model: {result['model_name']}")
        print(f"Step: {result['step']}")
        print(f"Agents: {result['num_agents']}")
        print(f"Trajectories: {result['num_trajectories']}")
        
        # Test inference
        print("\n🧪 Testing inference...")
        response = await trainer.test_inference()
        print(f"Response: {response[:100]}...")
        
    finally:
        await trainer.close()


if __name__ == "__main__":
    asyncio.run(main())

