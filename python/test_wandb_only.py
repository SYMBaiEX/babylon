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
    
    # Use eliza-labs/babylon project (configured in W&B)
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    entity = os.getenv('WANDB_ENTITY', 'eliza-labs')  # Default to eliza-labs org
    
    print(f"✅ Using W&B project: {entity}/{project_name}")
    
    try:
        # Verify W&B API key is set (ART will read it from environment)
        if not wandb_key:
            raise ValueError("WANDB_API_KEY is required for inference, training, and logging to Weights & Biases.")
        
        print("✅ W&B API key found in environment")
        
        # Verify project exists and is accessible (like Colab example)
        print(f"🔗 Verifying project '{project_name}' exists under entity '{entity}'...")
        try:
            api = wandb.Api()
            proj = api.project(project_name, entity=entity)
            print(f"✅ Project '{project_name}' verified at https://wandb.ai/{entity}/{project_name}/")
        except Exception as e:
            print(f"⚠️  Could not verify project: {e}")
            print(f"   Will try to create during registration")
        
        # Create model - pass entity explicitly (backend.register() uses model.entity)
        model_name = f"babylon-test-{int(asyncio.get_event_loop().time())}"
        model = art.TrainableModel(
            name=model_name,
            project=project_name,
            entity=entity,  # CRITICAL: Backend uses model.entity in register()
            base_model='OpenPipe/Qwen3-14B-Instruct'
        )
        print(f"✅ Model created: {model_name} in project '{entity}/{project_name}'")
        
        # Create backend - ART Colab pattern: no arguments, reads from environment
        backend = ServerlessBackend()
        print("✅ ServerlessBackend created (reads WANDB_API_KEY from environment)")
        
        # Register model (this connects to W&B)
        # CRITICAL: Add retry logic for 524 timeouts (W&B infrastructure can be slow)
        print("\n🔗 Registering model with W&B...")
        print("   (This may take 1-2 minutes - W&B training API can be slow)")
        
        max_retries = 5
        retry_delay = 30  # seconds - longer delay for plan upgrade propagation
        
        for attempt in range(1, max_retries + 1):
            try:
                print(f"   Attempt {attempt}/{max_retries}...")
                if attempt > 1:
                    print(f"   Waiting {retry_delay}s before retry...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                
                # Wrap in asyncio.wait_for to add our own timeout
                # Increased timeout for plan upgrade - first registration can be slow
                print(f"   Calling model.register() (timeout: 300s)...")
                await asyncio.wait_for(
                    model.register(backend),
                    timeout=300.0  # 5 minute timeout per attempt
                )
                print("✅ Model registered with W&B!")
                break
                
            except asyncio.TimeoutError:
                print(f"   ⏱️  asyncio.TimeoutError after 5 minutes (attempt {attempt}/{max_retries})")
                if attempt < max_retries:
                    continue
                else:
                    print("❌ Model registration timed out after all retries")
                    raise Exception("W&B training API timeout - service may be overloaded")
                    
            except Exception as e:
                error_str = str(e)
                error_type = str(type(e))
                print(f"   Caught exception: {error_type}")
                print(f"   Error message (first 300 chars): {error_str[:300]}")
                
                # Retry on transient errors: 524 timeout, 500 workflow errors
                is_retryable = (
                    "524" in error_str or 
                    "timeout" in error_str.lower() or
                    "500" in error_str or
                    "workflow error" in error_str.lower() or
                    "InternalServerError" in error_type
                )
                
                print(f"   Is retryable: {is_retryable}, attempt {attempt}/{max_retries}")
                
                if is_retryable and attempt < max_retries:
                    if "500" in error_str or "workflow error" in error_str.lower():
                        print(f"   ⚠️  W&B workflow error (attempt {attempt}/{max_retries}) - retrying...")
                    elif "524" in error_str or "timeout" in error_str.lower():
                        print(f"   ⚠️  524 timeout (attempt {attempt}/{max_retries}) - retrying...")
                    else:
                        print(f"   ⚠️  Retryable error (attempt {attempt}/{max_retries}) - retrying...")
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
        print(f"Project: {project_name}")
        print(f"Entity: {entity} (from WANDB_ENTITY env var)")
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

