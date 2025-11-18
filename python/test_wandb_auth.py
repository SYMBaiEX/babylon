"""
Test W&B authentication and permissions
"""
import os
import wandb
from dotenv import load_dotenv
from pathlib import Path

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

def test_wandb_auth():
    """Test W&B authentication"""
    wandb_key = os.getenv('WANDB_API_KEY')
    
    if not wandb_key:
        print("❌ WANDB_API_KEY not found")
        return False
    
    print(f"✅ Testing W&B authentication...")
    
    try:
        # Test 1: Check API key works
        print("\n🔗 Test 1: Verifying API key...")
        api = wandb.Api(api_key=wandb_key)
        viewer = api.viewer
        print(f"✅ API key valid")
        print(f"   Username: {viewer.username}")
        print(f"   Entity: {viewer.entity}")
        
        # Test 2: List teams/orgs
        print("\n🔗 Test 2: Checking teams/organizations...")
        try:
            teams = api.teams()
            print(f"✅ Found {len(teams)} teams:")
            for team in teams:
                print(f"   - {team.name} ({team.entity})")
        except Exception as e:
            print(f"⚠️  Could not list teams: {e}")
        
        # Test 3: Check if eliza-labs org exists and is accessible
        print("\n🔗 Test 3: Checking eliza-labs organization...")
        try:
            org = api.organization("eliza-labs")
            print(f"✅ Organization 'eliza-labs' exists")
            print(f"   Name: {org.name}")
        except Exception as e:
            print(f"⚠️  Could not access 'eliza-labs' org: {e}")
        
        # Test 4: Check if eliza-labs-org exists
        print("\n🔗 Test 4: Checking eliza-labs-org organization...")
        try:
            org = api.organization("eliza-labs-org")
            print(f"✅ Organization 'eliza-labs-org' exists")
            print(f"   Name: {org.name}")
        except Exception as e:
            print(f"⚠️  Could not access 'eliza-labs-org' org: {e}")
        
        # Test 5: Check projects under personal account
        print("\n🔗 Test 5: Checking projects under personal account...")
        try:
            projects = api.projects(entity=viewer.username)
            print(f"✅ Found {len(list(projects))} projects under {viewer.username}")
        except Exception as e:
            print(f"⚠️  Could not list projects: {e}")
        
        # Test 6: Check projects under eliza-labs
        print("\n🔗 Test 6: Checking projects under eliza-labs...")
        try:
            projects = api.projects(entity="eliza-labs")
            project_list = list(projects)
            print(f"✅ Found {len(project_list)} projects under eliza-labs:")
            for proj in project_list[:5]:
                print(f"   - {proj.name}")
        except Exception as e:
            print(f"⚠️  Could not list projects: {e}")
        
        print("\n" + "=" * 70)
        print("✅ AUTHENTICATION TEST COMPLETE")
        print("=" * 70)
        print(f"Logged in as: {viewer.username}")
        print(f"Entity: {viewer.entity}")
        print("\n💡 Next steps:")
        print("   1. Ensure you have write access to the target organization")
        print("   2. Check W&B dashboard for project permissions")
        print("   3. Verify API key has necessary scopes")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Authentication test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_wandb_auth()
    exit(0 if success else 1)

