"""
Test W&B integration with comprehensive logging
Shows exactly what API calls are being made
"""
import os
import asyncio
import logging
import sys
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stdout
)

# Enable HTTP logging
import httpx
httpx_logger = logging.getLogger("httpx")
httpx_logger.setLevel(logging.DEBUG)

# Enable OpenAI client logging
openai_logger = logging.getLogger("openai")
openai_logger.setLevel(logging.DEBUG)

async def test_with_logging():
    """Test with full logging enabled"""
    wandb_key = os.getenv('WANDB_API_KEY')
    entity = os.getenv('WANDB_ENTITY', 'elizaos')
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    print("=" * 70)
    print("W&B INTEGRATION TEST WITH FULL LOGGING")
    print("=" * 70)
    print(f"Entity: {entity}")
    print(f"Project: {project_name}")
    print(f"API Key: {'*' * (len(wandb_key) - 4) + wandb_key[-4:] if len(wandb_key) > 4 else '***'}")
    print("=" * 70)
    print("\n🔍 IMPORTANT: This connects to W&B's REMOTE API")
    print("   URL: https://api.training.wandb.ai")
    print("   NOT a local connection - requires internet access")
    print("   524 timeout = W&B's servers are overloaded/timing out")
    print("=" * 70)
    
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        model_name = f"test-logging-{int(asyncio.get_event_loop().time())}"
        
        print(f"\n📦 Step 1: Creating TrainableModel...")
        print(f"   Name: {model_name}")
        print(f"   Project: {project_name}")
        print(f"   Entity: {entity}")
        print(f"   Base Model: OpenPipe/Qwen3-14B-Instruct")
        
        model = art.TrainableModel(
            name=model_name,
            project=project_name,
            entity=entity,
            base_model='OpenPipe/Qwen3-14B-Instruct'
        )
        print(f"✅ Model object created")
        
        print(f"\n📦 Step 2: Creating ServerlessBackend...")
        print(f"   This will connect to: api.training.wandb.ai")
        print(f"   (W&B's remote training API - NOT local)")
        
        backend = ServerlessBackend(api_key=wandb_key)
        
        if hasattr(backend, '_client'):
            client = backend._client
            if hasattr(client, 'base_url'):
                print(f"✅ Backend created")
                print(f"   Base URL: {client.base_url}")
        
        print(f"\n🚀 Step 3: Registering model...")
        print(f"   This will make HTTP POST request to W&B's API")
        print(f"   Endpoint: {client.base_url if hasattr(backend, '_client') and hasattr(backend._client, 'base_url') else 'api.training.wandb.ai'}/models/create")
        print(f"   Payload: entity={entity}, project={project_name}, name={model_name}")
        print(f"\n   ⏱️  Starting registration (watch for HTTP logs below)...")
        print("   " + "-" * 66)
        
        start_time = asyncio.get_event_loop().time()
        
        try:
            await asyncio.wait_for(
                model.register(backend),
                timeout=180.0
            )
            
            elapsed = asyncio.get_event_loop().time() - start_time
            print("\n   " + "-" * 66)
            print(f"✅ Model registered successfully!")
            print(f"   Time taken: {elapsed:.2f} seconds")
            print(f"   Model ID: {model.id if hasattr(model, 'id') else 'N/A'}")
            
            inference_name = model.get_inference_name()
            step = await model.get_step()
            print(f"   Inference name: {inference_name}:step{step}")
            
            return True
            
        except asyncio.TimeoutError:
            elapsed = asyncio.get_event_loop().time() - start_time
            print("\n   " + "-" * 66)
            print(f"❌ TIMEOUT after {elapsed:.2f} seconds")
            print(f"   W&B's API (api.training.wandb.ai) did not respond")
            print(f"   This is a 524 Cloudflare timeout")
            print(f"   W&B's origin server is overloaded or having issues")
            return False
            
        except Exception as e:
            elapsed = asyncio.get_event_loop().time() - start_time
            print("\n   " + "-" * 66)
            print(f"❌ ERROR after {elapsed:.2f} seconds")
            print(f"   Type: {type(e).__name__}")
            print(f"   Message: {str(e)[:500]}")
            
            if "524" in str(e):
                print(f"\n   🔍 DIAGNOSIS: 524 Cloudflare Timeout")
                print(f"   This means W&B's origin server timed out")
                print(f"   NOT a local connection issue")
                print(f"   Check: https://status.wandb.ai")
            
            import traceback
            print(f"\n   Full traceback:")
            traceback.print_exc()
            return False
            
    except Exception as e:
        print(f"\n❌ Test setup failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_with_logging())
    exit(0 if success else 1)

