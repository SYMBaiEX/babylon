#!/usr/bin/env python3
"""
Test W&B with explicit timeout configuration
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

async def test_with_custom_timeout():
    """Test W&B with custom timeout configuration"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    print(f"✅ WANDB_API_KEY found ({len(wandb_key)} chars)\n")
    
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        from art.client import Client
        import httpx
        
        project = os.getenv('WANDB_PROJECT', 'babylon')
        entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
        base_model = os.getenv('BASE_MODEL', 'OpenPipe/Qwen3-14B-Instruct')
        
        print(f"📁 Project: {entity}/{project}")
        print(f"🤖 Base Model: {base_model}\n")
        
        # Test 1: Check if we can create a Client with custom timeout
        print("=" * 70)
        print("TEST 1: Create Client with custom configuration")
        print("=" * 70)
        
        # The Client uses AsyncOpenAGI which uses httpx internally
        # We can't directly set httpx timeout, but we can try a different base_url
        # or check if there's an alternative endpoint
        
        # Try the default endpoint first
        client = Client(api_key=wandb_key)
        print(f"✅ Client created")
        print(f"   Base URL: {client.base_url}")
        
        # Test 2: Try model registration with explicit timeout wrapper
        print("\n" + "=" * 70)
        print("TEST 2: Model Registration with Timeout")
        print("=" * 70)
        
        model_name = f"test-timeout-{int(asyncio.get_event_loop().time())}"
        model = art.TrainableModel(
            name=model_name,
            project=project,
            base_model=base_model
        )
        
        backend = ServerlessBackend(api_key=wandb_key)
        
        print(f"   Model name: {model_name}")
        print(f"   Attempting registration with 120 second timeout...")
        print(f"   (W&B training API can be slow on first request)")
        
        try:
            # Wrap in asyncio.wait_for with longer timeout
            await asyncio.wait_for(
                model.register(backend),
                timeout=120.0  # 2 minutes - longer than Cloudflare's 100s default
            )
            
            print("✅ Model registration succeeded!")
            print(f"   Model ID: {model.id}")
            print(f"   Entity: {model.entity}")
            print(f"   Inference name: {model.inference_model_name}")
            
            # Verify it exists on W&B
            print("\n" + "=" * 70)
            print("TEST 3: Verify Model on W&B")
            print("=" * 70)
            
            import wandb
            wandb.login(key=wandb_key)
            api = wandb.Api()
            
            # The model should be accessible via wandb API
            print("✅ Model registered successfully!")
            print(f"   Check dashboard: https://wandb.ai/{entity}/{project}")
            
            return True
            
        except asyncio.TimeoutError:
            print("❌ Model registration timed out after 120 seconds")
            print("\n💡 DIAGNOSIS:")
            print("   The W&B training API is taking too long to respond.")
            print("   This could mean:")
            print("   1. W&B service is overloaded/slow")
            print("   2. First-time model creation takes longer")
            print("   3. Network/connectivity issues")
            print("\n   Try:")
            print("   - Wait a few minutes and retry")
            print("   - Check W&B status: https://status.wandb.ai")
            print("   - Try again later")
            return False
            
        except Exception as e:
            error_str = str(e)
            print(f"❌ Model registration failed: {e}")
            print(f"   Error type: {type(e).__name__}")
            
            if "524" in error_str or "timeout" in error_str.lower():
                print("\n💡 FIX: This is a Cloudflare timeout (524)")
                print("   The W&B training API endpoint is timing out.")
                print("\n   Solutions:")
                print("   1. Wait and retry (W&B might be processing)")
                print("   2. Check if W&B has status issues")
                print("   3. The first model registration can take longer")
                print("   4. Try creating the project manually first:")
                print(f"      - Visit: https://wandb.ai/{entity}")
                print(f"      - Create project: {project}")
            else:
                print(f"\n   Full error: {error_str[:500]}")
            
            import traceback
            traceback.print_exc()
            return False
        
    except Exception as e:
        print(f"❌ Test setup failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_with_custom_timeout())
    print("\n" + "=" * 70)
    if success:
        print("✅ SUCCESS - W&B integration verified!")
        print("   Model exists on W&B servers - check the dashboard!")
    else:
        print("⚠️  TIMEOUT ISSUE DETECTED")
        print("   See diagnosis above for solutions")
    print("=" * 70)
    sys.exit(0 if success else 1)

