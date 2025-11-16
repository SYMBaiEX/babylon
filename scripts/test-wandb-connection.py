#!/usr/bin/env python3
"""
Test W&B Connection - Verify that we can actually connect and create runs on W&B
"""

import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "python" / "src"))

from dotenv import load_dotenv
import asyncio

# Load environment
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
env_local_path = project_root / '.env.local'

if env_local_path.exists():
    load_dotenv(env_local_path, override=True)
if env_path.exists():
    load_dotenv(env_path, override=False)

async def test_wandb_connection():
    """Test W&B connection by creating a test run"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    print(f"✅ WANDB_API_KEY found ({len(wandb_key)} chars)")
    
    try:
        import art
        from art.serverless.backend import ServerlessBackend
    except ImportError as e:
        print(f"❌ ART not installed: {e}")
        print("   Install with: pip install openpipe-art==0.5.1")
        return False
    
    project = os.getenv('WANDB_PROJECT', 'babylon')
    entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
    base_model = os.getenv('BASE_MODEL', 'OpenPipe/Qwen3-14B-Instruct')
    
    print(f"\n📁 Project: {entity}/{project}")
    print(f"🤖 Base Model: {base_model}")
    
    try:
        print("\n🔌 Testing W&B ServerlessBackend connection...")
        
        # Create a test model
        model_name = f"test-connection-{int(asyncio.get_event_loop().time())}"
        model = art.TrainableModel(
            name=model_name,
            project=project,
            base_model=base_model
        )
        
        # Create backend with API key
        backend = ServerlessBackend(api_key=wandb_key)
        
        # Register model - this will create a run on W&B
        print("   Registering model with W&B...")
        await model.register(backend)
        
        print("✅ Model registered successfully!")
        print(f"   Inference name: {model.inference_model_name}")
        
        # Get step
        step = await model.get_step()
        print(f"   Current step: {step}")
        
        # Get the run URL
        inference_name = f"{model.inference_model_name}:step{step}"
        print(f"\n✅ W&B Connection Test PASSED!")
        print(f"   Model: {inference_name}")
        print(f"   Project: {entity}/{project}")
        print(f"\n💡 Check your W&B dashboard:")
        print(f"   https://wandb.ai/{entity}/{project}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ W&B Connection Test FAILED")
        print(f"   Error: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        
        import traceback
        print(f"\n📋 Full traceback:")
        traceback.print_exc()
        
        return False

if __name__ == "__main__":
    success = asyncio.run(test_wandb_connection())
    sys.exit(0 if success else 1)

