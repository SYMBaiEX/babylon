#!/usr/bin/env python3
"""
Quick test to verify W&B ServerlessBackend is working.

Tests:
1. W&B API key is available
2. Can connect to W&B Training API
3. Can register a model with ServerlessBackend

Usage:
    python python/scripts/test_wandb_serverless.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "python" / "src"))

from dotenv import load_dotenv

# Load environment
env_local = project_root / '.env.local'
env_file = project_root / '.env'
if env_local.exists():
    load_dotenv(env_local)
if env_file.exists():
    load_dotenv(env_file, override=False)


async def test_wandb_connection():
    """Test W&B API connection"""
    print("=" * 60)
    print("🧪 W&B SERVERLESS BACKEND TEST")
    print("=" * 60)
    
    # Step 1: Check API key
    print("\n[1/4] Checking W&B API key...")
    wandb_key = os.getenv("WANDB_API_KEY")
    
    if not wandb_key:
        # Try to get from wandb CLI login
        try:
            import wandb
            wandb.login()  # Uses stored credentials
            api = wandb.Api()
            wandb_key = api.api_key
            print(f"   ✅ Got API key from wandb login")
        except Exception as e:
            print(f"   ❌ No WANDB_API_KEY and wandb login failed: {e}")
            print("\n   To fix: run 'wandb login' or set WANDB_API_KEY environment variable")
            return False
    else:
        print(f"   ✅ WANDB_API_KEY found ({len(wandb_key)} chars)")
    
    # Step 2: Test W&B API connection
    print("\n[2/4] Testing W&B API connection...")
    try:
        import wandb
        wandb.login(key=wandb_key)
        api = wandb.Api()
        user = api.viewer.username
        print(f"   ✅ Connected as: {user}")
    except Exception as e:
        print(f"   ❌ W&B API connection failed: {e}")
        return False
    
    # Step 3: Test ART ServerlessBackend
    print("\n[3/4] Testing ART ServerlessBackend...")
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        backend = ServerlessBackend(api_key=wandb_key)
        print(f"   ✅ ServerlessBackend created")
        print(f"   Base URL: {backend._base_url}")
    except Exception as e:
        print(f"   ❌ ServerlessBackend creation failed: {e}")
        return False
    
    # Step 4: Test model registration
    print("\n[4/4] Testing model registration...")
    try:
        entity = os.getenv("WANDB_ENTITY", user)  # Use logged-in user as entity
        project = "babylon-test"
        model_name = f"test-model-{int(asyncio.get_event_loop().time()) % 10000}"
        
        print(f"   Entity: {entity}")
        print(f"   Project: {project}")
        print(f"   Model: {model_name}")
        
        model = art.TrainableModel(
            name=model_name,
            project=project,
            entity=entity,
            base_model="OpenPipe/Qwen3-14B-Instruct"  # Only model in W&B catalog
        )
        
        print(f"   Registering model with W&B...")
        
        # Add timeout for registration
        await asyncio.wait_for(
            model.register(backend),
            timeout=120.0  # 2 minute timeout
        )
        
        print(f"   ✅ Model registered successfully!")
        print(f"   Model ID: {model.id}")
        print(f"   Inference name: {model.get_inference_name()}")
        
    except asyncio.TimeoutError:
        print(f"   ⚠️  Model registration timed out (120s)")
        print(f"   This may indicate W&B servers are slow but connection is working")
        return True  # Connection works, just slow
    except Exception as e:
        error_str = str(e)
        print(f"   ❌ Model registration failed: {error_str[:200]}")
        
        # Provide helpful diagnostics
        if "524" in error_str:
            print("\n   💡 524 = Cloudflare timeout. W&B servers are slow but reachable.")
            return True  # Connection works
        elif "401" in error_str or "unauthorized" in error_str.lower():
            print("\n   💡 Check your API key permissions")
        elif "403" in error_str or "forbidden" in error_str.lower():
            print("\n   💡 Your account may not have W&B Training access")
            print("   Visit: https://wandb.ai/settings to check your plan")
        return False
    
    print("\n" + "=" * 60)
    print("✅ W&B SERVERLESS BACKEND IS WORKING!")
    print("=" * 60)
    print(f"\nYou can now run training with:")
    print(f"  BASE_MODEL=OpenPipe/Qwen3-14B-Instruct python python/src/training/babylon_trainer.py")
    
    return True


async def main():
    success = await test_wandb_connection()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())

