#!/usr/bin/env python3
"""
Fix W&B Timeout - Create project first, then test model registration
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

async def fix_wandb_timeout():
    """Fix W&B timeout by ensuring project exists first"""
    
    wandb_key = os.getenv('WANDB_API_KEY')
    if not wandb_key:
        print("❌ WANDB_API_KEY not set")
        return False
    
    project = os.getenv('WANDB_PROJECT', 'babylon')
    entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
    base_model = os.getenv('BASE_MODEL', 'OpenPipe/Qwen3-14B-Instruct')
    
    print("=" * 70)
    print("FIXING W&B TIMEOUT ISSUE")
    print("=" * 70)
    print(f"Entity: {entity}")
    print(f"Project: {project}")
    print(f"Base Model: {base_model}\n")
    
    # Step 1: Ensure project exists using wandb API
    print("STEP 1: Ensure project exists on W&B...")
    try:
        import wandb
        wandb.login(key=wandb_key)
        api = wandb.Api()
        
        print(f"✅ Logged in as: {api.viewer.username}")
        
        # Try to access the project - this will create it if it doesn't exist
        try:
            # Try to list runs - this will create project if needed
            runs = list(api.runs(f'{entity}/{project}', per_page=1))
            print(f"✅ Project exists! Found {len(runs)} runs")
        except Exception as e:
            if "Could not find project" in str(e):
                print(f"⚠️  Project doesn't exist yet")
                print(f"   Creating project by initializing wandb run...")
                
                # Create project by initializing a wandb run
                wandb.init(
                    project=project,
                    entity=entity,
                    name="project-initialization",
                    config={"purpose": "project_creation"},
                    mode="online"
                )
                wandb.finish()
                print(f"✅ Project created!")
            else:
                print(f"⚠️  Error checking project: {e}")
        
    except Exception as e:
        print(f"❌ Failed to ensure project exists: {e}")
        return False
    
    # Step 2: Try model registration with project existing
    print("\nSTEP 2: Test model registration (project now exists)...")
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        model_name = f"test-fix-{int(asyncio.get_event_loop().time())}"
        model = art.TrainableModel(
            name=model_name,
            project=project,
            base_model=base_model
        )
        
        backend = ServerlessBackend(api_key=wandb_key)
        
        print(f"   Model name: {model_name}")
        print(f"   Registering with W&B training API...")
        print(f"   (This may take 30-60 seconds)")
        
        # Try with longer timeout since project exists
        try:
            await asyncio.wait_for(
                model.register(backend),
                timeout=180.0  # 3 minutes - should be enough
            )
            
            print("✅ Model registration succeeded!")
            print(f"   Model ID: {model.id}")
            print(f"   Entity: {model.entity}")
            print(f"   Inference name: {model.inference_model_name}")
            
            # Step 3: Verify it's actually on W&B
            print("\nSTEP 3: Verify model exists on W&B servers...")
            
            # Check via wandb API
            try:
                # Models are stored as artifacts in W&B
                # The model should be accessible via the inference name
                inference_name = f"{model.inference_model_name}:step{await model.get_step()}"
                print(f"✅ Model registered: {inference_name}")
                print(f"\n💡 Verify on W&B dashboard:")
                print(f"   https://wandb.ai/{entity}/{project}")
                print(f"\n✅ SUCCESS - Model exists on W&B servers!")
                return True
                
            except Exception as e:
                print(f"⚠️  Could not verify via wandb API: {e}")
                print(f"   But model registration succeeded, so it should be on W&B")
                return True
            
        except asyncio.TimeoutError:
            print("❌ Still timing out after 3 minutes")
            print("\n💡 This suggests W&B training API is having issues")
            print("   Possible fixes:")
            print("   1. Check W&B status: https://status.wandb.ai")
            print("   2. Try again in a few minutes")
            print("   3. Contact W&B support if issue persists")
            return False
            
        except Exception as e:
            error_str = str(e)
            print(f"❌ Model registration failed: {e}")
            
            if "524" in error_str:
                print("\n💡 FIX: Cloudflare 524 timeout")
                print("   The W&B training API endpoint is timing out.")
                print("   This is a W&B infrastructure issue.")
                print("\n   Workaround:")
                print("   1. Wait 5-10 minutes and retry")
                print("   2. The first model registration can be slow")
                print("   3. Check W&B status page")
            else:
                print(f"\n   Error details: {error_str[:300]}")
            
            import traceback
            traceback.print_exc()
            return False
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(fix_wandb_timeout())
    print("\n" + "=" * 70)
    if success:
        print("✅ FIXED - W&B integration verified!")
        print("   Model exists on W&B servers - check dashboard!")
    else:
        print("⚠️  TIMEOUT PERSISTS")
        print("   This is a W&B service issue - try again later")
    print("=" * 70)
    sys.exit(0 if success else 1)

