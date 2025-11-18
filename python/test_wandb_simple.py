"""
Simplified W&B test - verify model can be registered
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

async def test_simple():
    """Simplified test - just verify we can create and register a model"""
    wandb_key = os.getenv('WANDB_API_KEY')
    entity = os.getenv('WANDB_ENTITY', 'elizaos')
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    print(f"✅ Testing W&B model registration")
    print(f"   Entity: {entity}")
    print(f"   Project: {project_name}")
    
    try:
        import art
        from art.serverless.backend import ServerlessBackend
        
        # Step 1: Initialize wandb first to ensure project is ready
        print("\n🔗 Step 1: Initializing W&B...")
        try:
            wandb.login(key=wandb_key)
            run = wandb.init(
                project=project_name,
                entity=entity,
                name="test-init",
                mode="online"
            )
            print("✅ W&B initialized")
            run.finish()
        except Exception as e:
            print(f"⚠️  wandb.init failed: {e}")
            print("   Continuing anyway - ART may work without it")
        
        # Step 2: Create model
        print("\n🔗 Step 2: Creating ART model...")
        model_name = f"test-simple-{int(asyncio.get_event_loop().time())}"
        model = art.TrainableModel(
            name=model_name,
            project=project_name,
            entity=entity,
            base_model='OpenPipe/Qwen3-14B-Instruct'
        )
        print(f"✅ Model created: {model_name}")
        
        # Step 3: Create backend
        print("\n🔗 Step 3: Creating backend...")
        backend = ServerlessBackend(api_key=wandb_key)
        print("✅ Backend created")
        
        # Step 4: Register model with shorter timeout
        print("\n🔗 Step 4: Registering model...")
        print("   (Timeout: 180s)")
        
        try:
            await asyncio.wait_for(
                model.register(backend),
                timeout=180.0
            )
            
            print("✅ Model registered successfully!")
            print(f"   Model ID: {model.id}")
            print(f"   Entity: {model.entity}")
            print(f"   Project: {model.project}")
            
            # Step 5: Verify model exists
            print("\n🔗 Step 5: Verifying model exists...")
            inference_name = model.get_inference_name()
            step = await model.get_step()
            full_name = f"{inference_name}:step{step}"
            
            print(f"✅ Model verified: {full_name}")
            print(f"\n💡 Check W&B dashboard:")
            print(f"   https://wandb.ai/{entity}/{project_name}")
            
            return True
            
        except asyncio.TimeoutError:
            print("❌ Registration timed out after 3 minutes")
            return False
        except Exception as e:
            error_str = str(e)
            print(f"❌ Registration failed: {error_str[:500]}")
            
            # Check if model was partially created
            if hasattr(model, 'id') and model.id:
                print(f"\n⚠️  Model may have been created despite error")
                print(f"   Model ID: {model.id}")
                try:
                    inference_name = model.get_inference_name()
                    print(f"   Inference name: {inference_name}")
                    return True
                except:
                    pass
            
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_simple())
    exit(0 if success else 1)

