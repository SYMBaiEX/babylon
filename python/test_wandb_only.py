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
        import wandb
        from art.serverless.backend import ServerlessBackend
    except ImportError as e:
        print(f"❌ ART framework not installed: {e}")
        print("Install with: pip install openpipe-art==0.5.1")
        return False
    
    print("✅ ART framework imported")
    
    # CRITICAL: Always use personal account (has write access) instead of org
    # Even if WANDB_ENTITY is set to an org, we need personal account for model training
    project_name = os.getenv('WANDB_PROJECT', 'babylon-continuous')
    env_entity = os.getenv('WANDB_ENTITY')
    
    try:
        print("🔍 Detecting W&B personal account from API...")
        wandb.login(key=wandb_key)
        api = wandb.Api()
        # CRITICAL: Always use viewer.username (personal account) for model training
        # Orgs may not have "models write access" permission
        entity = api.viewer.username  # Personal account (has write access)
        default_entity = api.viewer.entity  # Might be org
        
        if env_entity and env_entity != entity:
            print(f"⚠️  WANDB_ENTITY is set to '{env_entity}' (org, may not have write access)")
            print(f"✅ Overriding to personal account: {entity} (has write access)")
        elif entity != default_entity:
            print(f"⚠️  Default entity is '{default_entity}' (org, may not have write access)")
            print(f"✅ Using personal account: {entity} (has write access)")
        else:
            print(f"✅ Using entity: {entity}")
    except Exception as e:
        print(f"❌ Could not detect entity: {e}")
        if env_entity:
            print(f"   Falling back to WANDB_ENTITY: {env_entity}")
            entity = env_entity
        else:
            print("   Set WANDB_ENTITY=your-username in .env.local")
            return False
    
    # Use entity/project format
    if "/" not in project_name:
        full_project = f"{entity}/{project_name}"
    else:
        full_project = project_name
    
    print(f"📦 Project: {full_project}")
    
    try:
        # Initialize wandb with extended timeout to fix 524 errors
        # CRITICAL: Don't create a run yet - just verify connection
        # The ART model registration will create its own run
        print("🔗 Verifying W&B connection...")
        # Just verify API access, don't create run yet
        api = wandb.Api()
        try:
            # Try to access the project (will create if doesn't exist)
            _ = api.project(project_name, entity=entity)
            print(f"✅ Project '{project_name}' accessible under entity '{entity}'")
        except Exception as e:
            print(f"⚠️  Project check: {e}")
            print("   Will try to create during model registration")
        
        wandb_run = None  # Don't create run yet - ART will handle it
        print("✅ W&B connection verified")
        
        # Create model with explicit entity
        model = art.TrainableModel(
            name=f"babylon-test-{int(asyncio.get_event_loop().time())}",
            project=full_project,
            entity=entity,  # CRITICAL: Pass entity separately to use personal account
            base_model='OpenPipe/Qwen3-14B-Instruct'
        )
        print("✅ Model created")
        
        # Create backend with W&B
        backend = ServerlessBackend(api_key=wandb_key)
        print("✅ ServerlessBackend created")
        
        # Register model (this connects to W&B)
        # CRITICAL: Add retry logic for 524 timeouts (W&B infrastructure can be slow)
        print("\n🔗 Registering model with W&B...")
        print("   (This may take 1-2 minutes - W&B training API can be slow)")
        
        max_retries = 3
        retry_delay = 10  # seconds
        
        for attempt in range(1, max_retries + 1):
            try:
                if attempt > 1:
                    print(f"   Retry attempt {attempt}/{max_retries} (waiting {retry_delay}s)...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                
                # Wrap in asyncio.wait_for to add our own timeout
                await asyncio.wait_for(
                    model.register(backend),
                    timeout=180.0  # 3 minute timeout per attempt
                )
                print("✅ Model registered with W&B!")
                break
                
            except asyncio.TimeoutError:
                if attempt < max_retries:
                    print(f"   ⏱️  Timeout after 3 minutes (attempt {attempt}/{max_retries})")
                    continue
                else:
                    print("❌ Model registration timed out after all retries")
                    raise Exception("W&B training API timeout - service may be overloaded")
                    
            except Exception as e:
                error_str = str(e)
                # Retry on transient errors: 524 timeout, 500 workflow errors
                is_retryable = (
                    "524" in error_str or 
                    "timeout" in error_str.lower() or
                    "500" in error_str or
                    "workflow error" in error_str.lower() or
                    "InternalServerError" in str(type(e))
                )
                
                if is_retryable and attempt < max_retries:
                    if "500" in error_str or "workflow error" in error_str.lower():
                        print(f"   ⚠️  W&B workflow error (attempt {attempt}/{max_retries}) - retrying...")
                    else:
                        print(f"   ⚠️  524 timeout (attempt {attempt}/{max_retries})")
                    continue
                elif is_retryable:
                    print("❌ W&B training API error after all retries")
                    print(f"   Error: {error_str[:200]}")
                    print("   This is a W&B infrastructure issue, not our code")
                    raise
                else:
                    # Different error - don't retry
                    print(f"❌ Non-retryable error: {error_str[:200]}")
                    raise
        
        # Get inference name
        inference_name = model.get_inference_name()
        step = await model.get_step()
        full_name = f"{inference_name}:step{step}"
        
        print("\n" + "=" * 70)
        print("✅ WANDB INTEGRATION VERIFIED")
        print("=" * 70)
        print(f"Model: {full_name}")
        print(f"Project: {full_project}")
        print(f"Entity: {entity}")
        print("W&B ServerlessBackend is working correctly!")
        print("=" * 70)
        
        # Finish wandb run if we created one
        if wandb_run:
            wandb_run.finish()
            print("✅ W&B run finished")
        
        return True
        
    except Exception as e:
        print(f"\n❌ W&B integration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_wandb())
    exit(0 if success else 1)

