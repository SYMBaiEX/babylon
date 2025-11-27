"""
Exact replica of the user's example notebook logic
"""
import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

async def test_exact_replica():
    print("=" * 70)
    print("TESTING EXACT REPLICA OF NOTEBOOK EXAMPLE")
    print("=" * 70)
    
    # 1. Set environment variable implicitly (like in notebook)
    # "os.environ["WANDB_API_KEY"] = ..."
    if not os.environ.get("WANDB_API_KEY"):
        raise ValueError("WANDB_API_KEY is required")
        
    print(f"✅ WANDB_API_KEY set in environment")
    
    # Import after env var is set
    import art
    from art.serverless.backend import ServerlessBackend
    
    # 2. Create model EXACTLY as in example
    # Note: NO entity passed
    print("\n📦 Creating TrainableModel (no entity passed)...")
    try:
        model = art.TrainableModel(
            name=f"babylon-replica-{int(asyncio.get_event_loop().time())}",
            project="babylon", # User's project name
            base_model="OpenPipe/Qwen3-14B-Instruct",
        )
        print(f"✅ Model created: {model.name}")
    except Exception as e:
        print(f"❌ Model creation failed: {e}")
        return False

    # 3. Create backend EXACTLY as in example
    # Note: NO api_key passed
    print("\n🔗 Creating ServerlessBackend (no api_key passed)...")
    try:
        backend = ServerlessBackend()
        print(f"✅ Backend created")
    except Exception as e:
        print(f"❌ Backend creation failed: {e}")
        return False

    # 4. Register model EXACTLY as in example
    print("\n🚀 Registering model...")
    try:
        await model.register(backend)
        print("✅ Model registered successfully!")
        
        inference_name = model.get_inference_name()
        step = await model.get_step()
        print(f"   Inference name: {inference_name}:step{step}")
        return True
        
    except Exception as e:
        print(f"❌ Registration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_exact_replica())
    exit(0 if success else 1)

