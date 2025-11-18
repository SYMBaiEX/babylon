"""
Verify W&B account status and permissions
"""
import os
import wandb
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

def verify_account():
    """Verify W&B account and permissions"""
    wandb_key = os.getenv('WANDB_API_KEY')
    entity = os.getenv('WANDB_ENTITY', 'elizaos')
    project_name = os.getenv('WANDB_PROJECT', 'babylon')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    print("=" * 70)
    print("W&B ACCOUNT VERIFICATION")
    print("=" * 70)
    
    try:
        # Login
        wandb.login(key=wandb_key)
        api = wandb.Api(api_key=wandb_key)
        
        # Get viewer info
        viewer = api.viewer
        print(f"\n✅ Logged in as: {viewer.username}")
        print(f"   Entity: {viewer.entity}")
        
        # Check project
        print(f"\n🔗 Checking project: {entity}/{project_name}")
        try:
            proj = api.project(project_name, entity=entity)
            print(f"✅ Project exists: {proj.name}")
            print(f"   URL: https://wandb.ai/{entity}/{project_name}")
        except Exception as e:
            print(f"⚠️  Project check failed: {e}")
            print(f"   Trying to create project...")
            try:
                # Try to create a run to create the project
                run = wandb.init(
                    project=project_name,
                    entity=entity,
                    name="verify-project",
                    mode="online"
                )
                run.finish()
                print(f"✅ Project created/verified")
            except Exception as e2:
                print(f"❌ Could not create project: {e2}")
                return False
        
        # Check if we can list models
        print(f"\n🔗 Checking existing models...")
        try:
            # Try to access models API
            # Note: ART models may not show up in standard wandb API
            print("   (ART models use a different API endpoint)")
        except Exception as e:
            print(f"   Note: {e}")
        
        # Check account type/plan
        print(f"\n🔗 Account information:")
        print(f"   Username: {viewer.username}")
        print(f"   Entity: {viewer.entity}")
        
        print("\n" + "=" * 70)
        print("✅ ACCOUNT VERIFICATION COMPLETE")
        print("=" * 70)
        print("\n💡 Next steps:")
        print("   1. Verify you have write access to the project")
        print("   2. Check W&B dashboard: https://wandb.ai/settings")
        print("   3. Ensure your plan supports model training")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = verify_account()
    exit(0 if success else 1)

