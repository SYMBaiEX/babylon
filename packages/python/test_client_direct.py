"""
Test ART Client directly to debug hanging registration
"""
import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

async def test_client_direct():
    """Test ART Client directly"""
    wandb_key = os.getenv('WANDB_API_KEY')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    try:
        from art.client import Client
        
        print("✅ Creating Client...")
        client = Client(api_key=wandb_key)
        print(f"✅ Client created")
        print(f"   Base URL: {client.base_url}")
        
        entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
        project_name = os.getenv('WANDB_PROJECT', 'babylon')
        model_name = f"test-direct-{int(asyncio.get_event_loop().time())}"
        base_model = 'OpenPipe/Qwen3-14B-Instruct'
        
        print(f"\n🔗 Testing models.create() directly...")
        print(f"   Entity: {entity}")
        print(f"   Project: {project_name}")
        print(f"   Model: {model_name}")
        print(f"   Base Model: {base_model}")
        
        # Try creating model directly
        print("\n   Calling client.models.create()...")
        print("   (This is what backend.register() calls internally)")
        
        try:
            client_model = await asyncio.wait_for(
                client.models.create(
                    entity=entity,
                    project=project_name,
                    name=model_name,
                    base_model=base_model,
                    return_existing=True,
                ),
                timeout=120.0  # 2 minute timeout
            )
            print(f"✅ Model created successfully!")
            print(f"   Model ID: {client_model.id}")
            print(f"   Entity: {client_model.entity}")
            print(f"   Project: {client_model.project}")
            print(f"   Name: {client_model.name}")
            
            await client.close()
            return True
            
        except asyncio.TimeoutError:
            print("❌ Timeout after 2 minutes")
            await client.close()
            return False
        except Exception as e:
            print(f"❌ Error: {e}")
            print(f"   Type: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            await client.close()
            return False
            
    except Exception as e:
        print(f"❌ Failed to create Client: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_client_direct())
    exit(0 if success else 1)

