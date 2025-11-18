"""
Test if we can access the babylon project and use ART without wandb.init()
"""
import os
import asyncio
import wandb
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

async def test_project_access():
    """Test project access and ART registration"""
    wandb_key = os.getenv('WANDB_API_KEY')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    
    print(f"✅ Testing project access...")
    print(f"   Entity: {entity}")
    print(f"   Project: {project_name}")
    
    try:
        # Test 1: Verify project exists
        print("\n🔗 Test 1: Verifying project exists...")
        api = wandb.Api(api_key=wandb_key)
        try:
            proj = api.project(project_name, entity=entity)
            print(f"✅ Project exists: {proj.name}")
        except Exception as e:
            print(f"❌ Project not accessible: {e}")
            return False
        
        # Test 2: Try ART model registration (bypasses wandb.init())
        print("\n🔗 Test 2: Testing ART model registration...")
        print("   (ART uses client.models.create() which may have different permissions)")
        
        try:
            import art
            from art.serverless.backend import ServerlessBackend
            
            model_name = f"test-art-{int(asyncio.get_event_loop().time())}"
            model = art.TrainableModel(
                name=model_name,
                project=project_name,
                entity=entity,
                base_model='OpenPipe/Qwen3-14B-Instruct'
            )
            print(f"✅ Model created: {model_name}")
            
            backend = ServerlessBackend(api_key=wandb_key)
            print(f"✅ Backend created")
            
            print(f"\n   Registering model (this may take 1-2 minutes)...")
            print(f"   Note: ART uses a different API endpoint than wandb.init()")
            print(f"   This might work even if wandb.init() fails")
            
            # Try with timeout
            try:
                await asyncio.wait_for(
                    model.register(backend),
                    timeout=120.0  # 2 minutes
                )
                print(f"\n✅ Model registered successfully!")
                print(f"   Model ID: {model.id}")
                print(f"   Entity: {model.entity}")
                print(f"   Project: {model.project}")
                
                inference_name = model.get_inference_name()
                step = await model.get_step()
                full_name = f"{inference_name}:step{step}"
                
                print(f"\n" + "=" * 70)
                print("✅ ART MODEL REGISTRATION SUCCESS")
                print("=" * 70)
                print(f"Model: {full_name}")
                print(f"Project: {entity}/{project_name}")
                print("=" * 70)
                
                return True
                
            except asyncio.TimeoutError:
                print(f"\n⏱️  Registration timed out after 2 minutes")
                print(f"   This suggests the API call is hanging")
                return False
            except Exception as e:
                error_str = str(e)
                print(f"\n❌ Registration failed: {error_str[:300]}")
                
                # Check if it's a permission error
                if "403" in error_str or "permission" in error_str.lower():
                    print(f"\n💡 This is a PERMISSION ERROR")
                    print(f"   The API key doesn't have write access to {entity}/{project_name}")
                    print(f"   You need to:")
                    print(f"   1. Get added to the '{entity}' org with write permissions")
                    print(f"   2. Or use a different API key with write access")
                    print(f"   3. Or create the project under your personal account")
                elif "524" in error_str or "timeout" in error_str.lower():
                    print(f"\n💡 This is a TIMEOUT ERROR")
                    print(f"   W&B API is slow or overloaded")
                    print(f"   Try again later or increase timeout")
                else:
                    print(f"\n💡 Unknown error - check traceback")
                    import traceback
                    traceback.print_exc()
                
                return False
                
        except ImportError as e:
            print(f"❌ ART not installed: {e}")
            return False
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_project_access())
    exit(0 if success else 1)

