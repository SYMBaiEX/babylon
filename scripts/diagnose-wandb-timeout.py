#!/usr/bin/env python3
"""
Diagnose W&B Timeout Issue
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

async def test_wandb_api_directly():
    """Test W&B API directly without model registration"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    print(f"✅ WANDB_API_KEY found ({len(wandb_key)} chars)\n")
    
    # Test 1: wandb library
    print("=" * 70)
    print("TEST 1: W&B Python Library")
    print("=" * 70)
    try:
        import wandb
        wandb.login(key=wandb_key)
        api = wandb.Api()
        viewer = api.viewer
        print(f"✅ wandb.Api() works!")
        print(f"   Username: {viewer.username}")
        print(f"   Entity: {viewer.entity}")
        
        # Try to list runs
        try:
            runs = list(api.runs('eliza-labs/babylon', per_page=1))
            print(f"✅ Project exists! Found {len(runs)} runs")
        except Exception as e:
            print(f"⚠️  Project might not exist: {e}")
            print("   This is OK - project will be created on first run")
        
    except Exception as e:
        print(f"❌ wandb library test failed: {e}")
        return False
    
    # Test 2: ART Client directly
    print("\n" + "=" * 70)
    print("TEST 2: ART Client (without model registration)")
    print("=" * 70)
    try:
        from art.client import Client
        
        client = Client(api_key=wandb_key)
        print(f"✅ Client created")
        print(f"   Base URL: {client.base_url}")
        
        # Try to list existing models (read-only, should be fast)
        print("\n   Testing: List existing models...")
        models = []
        try:
            async for model in client.models.list(limit=1):
                models.append(model)
                print(f"   ✅ Found model: {model.name}")
                break
        except Exception as e:
            print(f"   ⚠️  No models found or error: {e}")
            print("   This is OK if no models exist yet")
        
        await client.close()
        print("✅ Client connection test passed!")
        
    except Exception as e:
        print(f"❌ ART Client test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 3: Model registration (the one that times out)
    print("\n" + "=" * 70)
    print("TEST 3: Model Registration (the timeout issue)")
    print("=" * 70)
    
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        project = os.getenv('WANDB_PROJECT', 'babylon')
        entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
        base_model = os.getenv('BASE_MODEL', 'OpenPipe/Qwen3-14B-Instruct')
        
        print(f"   Project: {entity}/{project}")
        print(f"   Base Model: {base_model}")
        print(f"   Testing model registration with timeout...")
        
        # Create model
        model_name = f"test-timeout-{int(asyncio.get_event_loop().time())}"
        model = art.TrainableModel(
            name=model_name,
            project=project,
            base_model=base_model
        )
        
        # Create backend
        backend = ServerlessBackend(api_key=wandb_key)
        
        # Try registration with explicit timeout handling
        print("   Attempting model registration...")
        print("   (This is where the timeout occurs)")
        
        try:
            # Use asyncio.wait_for to add our own timeout
            await asyncio.wait_for(
                model.register(backend),
                timeout=60.0  # 60 second timeout
            )
            print("✅ Model registration succeeded!")
            print(f"   Model ID: {model.id}")
            print(f"   Inference name: {model.inference_model_name}")
            return True
            
        except asyncio.TimeoutError:
            print("❌ Model registration timed out after 60 seconds")
            print("   This suggests the W&B training API is slow or unavailable")
            return False
        except Exception as e:
            print(f"❌ Model registration failed: {e}")
            print(f"   Error type: {type(e).__name__}")
            
            # Check if it's a timeout error
            error_str = str(e)
            if "524" in error_str or "timeout" in error_str.lower():
                print("\n💡 DIAGNOSIS: W&B Training API Timeout")
                print("   This is a W&B service issue, not our code.")
                print("   The API endpoint is responding but timing out.")
                print("\n   Possible solutions:")
                print("   1. Wait and retry (W&B service might be overloaded)")
                print("   2. Check W&B status: https://status.wandb.ai")
                print("   3. Try again later")
            else:
                print("\n💡 This might be a different issue - check error details above")
            
            import traceback
            traceback.print_exc()
            return False
        
    except Exception as e:
        print(f"❌ Model registration test setup failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_wandb_api_directly())
    print("\n" + "=" * 70)
    if success:
        print("✅ ALL TESTS PASSED - W&B integration is working!")
    else:
        print("⚠️  SOME TESTS FAILED - See details above")
    print("=" * 70)
    sys.exit(0 if success else 1)

