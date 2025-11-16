"""
Quick test to verify W&B integration works
Tests model initialization and registration without needing database
"""
import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

async def test_wandb():
    """Test W&B integration"""
    wandb_key = os.getenv('WANDB_API_KEY')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        print("Set it in .env.local: WANDB_API_KEY=your-key")
        return False
    
    print(f"✅ WANDB_API_KEY found ({len(wandb_key)} chars)")
    
    try:
        import art
        from art.serverless.backend import ServerlessBackend
    except ImportError as e:
        print(f"❌ ART framework not installed: {e}")
        print("Install with: pip install openpipe-art==0.5.1")
        return False
    
    print("✅ ART framework imported")
    
    try:
        # Create model
        model = art.TrainableModel(
            name=f"babylon-test-{int(asyncio.get_event_loop().time())}",
            project=os.getenv('WANDB_PROJECT', 'babylon-continuous'),
            base_model='OpenPipe/Qwen3-14B-Instruct'
        )
        print("✅ Model created")
        
        # Create backend with W&B
        backend = ServerlessBackend(api_key=wandb_key)
        print("✅ ServerlessBackend created")
        
        # Register model (this connects to W&B)
        print("\n🔗 Registering model with W&B...")
        await model.register(backend)
        print("✅ Model registered with W&B!")
        
        # Get inference name
        inference_name = model.get_inference_name()
        step = await model.get_step()
        full_name = f"{inference_name}:step{step}"
        
        print("\n" + "=" * 70)
        print("✅ WANDB INTEGRATION VERIFIED")
        print("=" * 70)
        print(f"Model: {full_name}")
        print(f"Project: {os.getenv('WANDB_PROJECT', 'babylon-continuous')}")
        print("W&B ServerlessBackend is working correctly!")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ W&B integration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_wandb())
    exit(0 if success else 1)

