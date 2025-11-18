"""
Test LocalBackend as a fallback for broken ServerlessBackend
"""
import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

async def test_local_backend():
    print("=" * 70)
    print("TESTING LOCAL BACKEND (FALLBACK)")
    print("=" * 70)
    
    # Force offline mode to bypass API checks
    os.environ["WANDB_MODE"] = "offline"
    print("✅ Set WANDB_MODE=offline")
    
    try:
        import art
        from art.local.backend import LocalBackend
        
        print("✅ Successfully imported LocalBackend")
        
        # Create model
        model_name = f"test-local-{int(asyncio.get_event_loop().time())}"
        print(f"\n📦 Creating model: {model_name}")
        
        model = art.TrainableModel(
            name=model_name,
            project="test-local-backend", # Use a fresh project
            entity=os.getenv("WANDB_ENTITY", "elizaos"),
            base_model="Qwen/Qwen2.5-7B-Instruct"  # Smaller model for local training
        )
        print(f"✅ Model created")
        
        # Create local backend
        print("\n🔗 Creating LocalBackend...")
        backend = LocalBackend()
        print(f"✅ LocalBackend created")
        
        # Register
        print("\n🚀 Registering with LocalBackend...")
        await model.register(backend)
        print("✅ Registration successful!")
        
        print("\n" + "=" * 70)
        print("SUCCESS: LocalBackend works!")
        print("=" * 70)
        print("We can use this to bypass W&B 524 errors.")
        print("This will run training on YOUR machine instead of W&B servers.")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ LocalBackend failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_local_backend())
    exit(0 if success else 1)

