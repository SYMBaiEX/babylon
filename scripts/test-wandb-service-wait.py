#!/usr/bin/env python3
"""
Test W&B with _service_wait parameter to fix 524 timeout
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

async def test_service_wait():
    """Test with _service_wait parameter"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    base_model = os.getenv('BASE_MODEL', 'OpenPipe/Qwen3-14B-Instruct')
    
    print("=" * 70)
    print("TESTING W&B WITH _service_wait PARAMETER")
    print("=" * 70)
    
    # Step 1: Initialize wandb with _service_wait BEFORE any operations
    print("\nSTEP 1: Initialize W&B with _service_wait=300...")
    try:
        import wandb
        
        # Get entity from API first
        wandb.login(key=wandb_key)
        api = wandb.Api()
        entity = api.viewer.username
        print(f"✅ Using entity: {entity} (personal account)")
        print(f"   Project: {project_name}")
        
        # CRITICAL: Initialize with _service_wait BEFORE any operations
        # Must create actual run (not disabled) for settings to take effect
        run = wandb.init(
            project=project_name,
            entity=entity,
            settings=wandb.Settings(_service_wait=300),  # 5 minute timeout
            name="wandb-init-service-wait"  # Create actual run for settings
        )
        print("✅ W&B initialized with _service_wait=300")
        print("   (Run created to set global settings)")
        
    except Exception as e:
        print(f"❌ Failed to initialize W&B: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Step 2: Test model registration with _service_wait active
    print("\nSTEP 2: Test model registration (with _service_wait active)...")
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        model_name = f"test-service-wait-{int(asyncio.get_event_loop().time())}"
        
        print(f"Creating TrainableModel: {model_name}")
        model = art.TrainableModel(
            name=model_name,
            project=project_name,
            entity=entity,  # Use personal account
            base_model=base_model
        )
        
        backend = ServerlessBackend(api_key=wandb_key)
        
        print(f"Registering model (this may take 30-60 seconds)...")
        print(f"   _service_wait=300 should prevent 524 timeout")
        
        await asyncio.wait_for(
            model.register(backend),
            timeout=180.0  # 3 minutes max
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
        
        # Clean up - finish the run we created
        run.finish()
        
        return True
        
    except asyncio.TimeoutError:
        print("❌ Still timing out after 3 minutes")
        print("   This suggests W&B service is having issues")
        try:
            run.finish()
        except:
            pass
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        try:
            run.finish()
        except:
            pass
        return False

if __name__ == "__main__":
    success = asyncio.run(test_service_wait())
    print("\n" + "=" * 70)
    if success:
        print("✅ SUCCESS - _service_wait fixed the 524 timeout!")
        print("   Model exists on W&B servers - check the dashboard!")
    else:
        print("⚠️  TEST FAILED")
        print("   Check error messages above")
    print("=" * 70)
    sys.exit(0 if success else 1)

