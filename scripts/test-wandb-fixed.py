#!/usr/bin/env python3
"""
Test W&B with FIXED entity (using personal account instead of org)
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

async def test_fixed():
    """Test with fixed entity (personal account)"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    base_model = os.getenv('BASE_MODEL', 'OpenPipe/Qwen3-14B-Instruct')
    
    print("=" * 70)
    print("TESTING W&B WITH FIXED ENTITY")
    print("=" * 70)
    
    # Get entity from API (personal account)
    try:
        import wandb
        wandb.login(key=wandb_key)
        api = wandb.Api()
        entity = api.viewer.username  # Personal account (has write access)
        print(f"✅ Using entity: {entity} (personal account)")
        print(f"   Project: {project_name}")
        print(f"   Full path: {entity}/{project_name}\n")
    except Exception as e:
        print(f"❌ Failed to get entity: {e}")
        return False
    
    # Test model registration
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        model_name = f"test-fixed-{int(asyncio.get_event_loop().time())}"
        
        print("Creating TrainableModel with explicit entity...")
        model = art.TrainableModel(
            name=model_name,
            project=project_name,
            entity=entity,  # CRITICAL: Use personal account
            base_model=base_model
        )
        
        backend = ServerlessBackend(api_key=wandb_key)
        
        print(f"Registering model: {model_name}")
        print("(This should work now with correct entity)...")
        
        await asyncio.wait_for(
            model.register(backend),
            timeout=180.0
        )
        
        print("✅ Model registration succeeded!")
        print(f"   Model ID: {model.id}")
        print(f"   Entity: {model.entity}")
        print(f"   Project: {model.project}")
        print(f"   Inference name: {model.inference_model_name}")
        
        step = await model.get_step()
        inference_name = f"{model.inference_model_name}:step{step}"
        
        print(f"\n✅ SUCCESS!")
        print(f"   Model: {inference_name}")
        print(f"   Check dashboard: https://wandb.ai/{entity}/{project_name}")
        
        return True
        
    except asyncio.TimeoutError:
        print("❌ Still timing out")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_fixed())
    sys.exit(0 if success else 1)

