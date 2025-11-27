"""
Test W&B SDK directly to verify API key works
"""
import os
import wandb
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

def test_wandb_sdk():
    """Test W&B SDK directly"""
    wandb_key = os.getenv('WANDB_API_KEY')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    entity = os.getenv('WANDB_ENTITY', 'eliza-labs')
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    
    print(f"✅ Testing W&B SDK directly...")
    print(f"   Entity: {entity}")
    print(f"   Project: {project_name}")
    
    try:
        # Test 1: Initialize wandb
        print("\n🔗 Test 1: wandb.init()...")
        run = wandb.init(
            entity=entity,
            project=project_name,
            name="test-sdk-direct",
            mode="online"
        )
        print("✅ wandb.init() succeeded")
        print(f"   Run ID: {run.id}")
        print(f"   Run URL: {run.url}")
        
        # Test 2: Log something
        print("\n🔗 Test 2: Logging metrics...")
        run.log({"test_metric": 1.0})
        print("✅ Metrics logged")
        
        # Test 3: Finish run
        print("\n🔗 Test 3: Finishing run...")
        run.finish()
        print("✅ Run finished")
        
        # Test 4: API access
        print("\n🔗 Test 4: Testing wandb.Api()...")
        api = wandb.Api()
        proj = api.project(project_name, entity=entity)
        print(f"✅ Project accessed: {proj.name}")
        
        print("\n" + "=" * 70)
        print("✅ W&B SDK DIRECT TEST PASSED")
        print("=" * 70)
        print("The API key works correctly with wandb SDK")
        print("If ART Client still hangs, it's likely an ART library issue")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ W&B SDK test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_wandb_sdk()
    exit(0 if success else 1)

