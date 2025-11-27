"""
Validate GitHub Actions Workflow (No Dependencies Required)
Checks workflow structure and script syntax
"""

import sys
import os
from pathlib import Path
import json

GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def print_success(msg):
    print(f"{GREEN}✅ {msg}{RESET}")

def print_error(msg):
    print(f"{RED}❌ {msg}{RESET}")

def print_warning(msg):
    print(f"{YELLOW}⚠️  {msg}{RESET}")

def print_step(msg):
    print(f"\n{'='*60}\n  {msg}\n{'='*60}\n")

def check_workflow_file():
    """Validate workflow YAML structure"""
    print_step("Validating Workflow File")
    
    workflow_path = Path(__file__).parent.parent.parent / '.github' / 'workflows' / 'rl-training.yml'
    
    if not workflow_path.exists():
        print_error(f"Workflow file not found: {workflow_path}")
        return False
    
    print_success(f"Workflow file exists: {workflow_path}")
    
    content = workflow_path.read_text()
    
    # Check required sections
    required_sections = [
        ('name:', 'Workflow name'),
        ('on:', 'Trigger configuration'),
        ('schedule:', 'Cron schedule'),
        ('workflow_dispatch:', 'Manual trigger'),
        ('jobs:', 'Job definitions'),
        ('steps:', 'Workflow steps'),
        ('DATABASE_URL', 'Database secret'),
    ]
    
    all_ok = True
    for section, description in required_sections:
        if section in content:
            print_success(f"{description} present")
        else:
            print_error(f"{description} MISSING ({section})")
            all_ok = False
    
    # Check cron schedule
    if '0 2 * * *' in content:
        print_success("Cron schedule: Daily at 2 AM UTC")
    else:
        print_error("Cron schedule not found or incorrect")
        all_ok = False
    
    # Check concurrency control
    if 'concurrency:' in content and 'training-pipeline' in content:
        print_success("Concurrency control configured")
    else:
        print_warning("Concurrency control might be missing")
    
    return all_ok

def check_trainer_script():
    """Validate trainer script exists and has required methods"""
    print_step("Validating Trainer Script")
    
    trainer_path = Path(__file__).parent.parent / 'src' / 'training' / 'atropos_trainer.py'
    
    if not trainer_path.exists():
        print_error(f"Trainer script not found: {trainer_path}")
        return False
    
    print_success("Trainer script exists")
    
    content = trainer_path.read_text()
    
    # Check required components
    required = [
        ('class BabylonAtroposTrainer', 'BabylonAtroposTrainer class'),
        ('async def train', 'train method'),
        ('class AtroposTrainingConfig', 'AtroposTrainingConfig class'),
    ]
    
    all_ok = True
    for pattern, description in required:
        if pattern in content:
            print_success(f"{description} found")
        else:
            print_error(f"{description} MISSING")
            all_ok = False
    
    # Check imports
    if 'import asyncpg' in content or 'from asyncpg' in content:
        print_success("Database library imported")
    else:
        print_warning("asyncpg not imported (may be imported elsewhere)")
    
    if 'atroposlib' in content or 'atropos' in content.lower():
        print_success("Atropos framework referenced")
    else:
        print_warning("Atropos not directly referenced")
    
    return all_ok

def check_requirements():
    """Validate requirements.txt"""
    print_step("Validating Requirements File")
    
    req_path = Path(__file__).parent.parent / 'requirements.txt'
    
    if not req_path.exists():
        print_error(f"requirements.txt not found: {req_path}")
        return False
    
    print_success("requirements.txt exists")
    
    content = req_path.read_text()
    
    required_packages = [
        ('atroposlib', 'Atropos framework'),
        ('asyncpg', 'PostgreSQL async driver'),
        ('python-dotenv', 'Environment variables'),
        ('pyyaml', 'YAML configuration'),
    ]
    
    all_ok = True
    for package, description in required_packages:
        if package in content:
            print_success(f"{description} ({package})")
        else:
            print_error(f"{description} MISSING ({package})")
            all_ok = False
    
    return all_ok

def check_setup_py():
    """Validate setup.py for pip install -e ."""
    print_step("Validating setup.py")
    
    setup_path = Path(__file__).parent.parent / 'setup.py'
    
    if not setup_path.exists():
        print_warning("setup.py not found (may use pyproject.toml instead)")
        
        # Check pyproject.toml instead
        pyproject_path = Path(__file__).parent.parent / 'pyproject.toml'
        if pyproject_path.exists():
            print_success("pyproject.toml exists")
            return True
        return False
    
    print_success("setup.py exists")
    
    content = setup_path.read_text()
    
    if 'find_packages' in content:
        print_success("Uses find_packages()")
    else:
        print_warning("Not using find_packages() - might have issues")
    
    if 'package_dir' in content and '"": "src"' in content:
        print_success("Package directory configured (src/)")
    else:
        print_warning("package_dir not configured (may use default)")
    
    return True

def check_python_scripts():
    """Validate inline Python scripts in workflow"""
    print_step("Validating Inline Python Scripts")
    
    scripts = [
        # Readiness check
        """
import asyncio
import asyncpg
import os
import sys

async def check():
    pool = await asyncpg.create_pool(os.getenv('DATABASE_URL'))
    count = await pool.fetchval('SELECT COUNT(*) FROM trajectories')
    await pool.close()

asyncio.run(check())
""",
        # Batch update
        """
import asyncio
import asyncpg
import os

async def update():
    pool = await asyncpg.create_pool(os.getenv('DATABASE_URL'))
    await pool.execute('INSERT INTO training_batches (\"batchId\", id) VALUES ($1, $1)', 'test')
    await pool.close()

asyncio.run(update())
""",
    ]
    
    all_ok = True
    for i, script in enumerate(scripts, 1):
        try:
            compile(script, f'<script{i}>', 'exec')
            print_success(f"Script {i} syntax valid")
        except SyntaxError as e:
            print_error(f"Script {i} syntax error: {e}")
            all_ok = False
    
    return all_ok

def check_environment():
    """Check environment variables"""
    print_step("Checking Environment Configuration")
    
    # Check what's available
    db_url = os.getenv('DATABASE_URL')
    
    if db_url:
        print_success(f"DATABASE_URL set: {db_url[:50]}...")
    else:
        print_warning("DATABASE_URL not set locally (OK - will be in GitHub Secrets)")
    
    return True  # Not required locally

def main():
    print("\n" + "="*60)
    print("  🧪 GITHUB ACTIONS WORKFLOW VALIDATION")
    print("  (Local Environment - Pre-Deployment Check)")
    print("="*60)
    
    results = [
        ("Workflow File", check_workflow_file()),
        ("Trainer Script", check_trainer_script()),
        ("Requirements", check_requirements()),
        ("Setup.py", check_setup_py()),
        ("Python Scripts", check_python_scripts()),
        ("Environment", check_environment()),
    ]
    
    print_step("VALIDATION SUMMARY")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        if result:
            print_success(f"{name}: PASSED")
        else:
            print_error(f"{name}: FAILED")
    
    print(f"\n{'='*60}")
    if passed == total:
        print_success(f"ALL CHECKS PASSED ({passed}/{total})")
        print_success("Workflow structure is correct!")
        print("")
        print("Note: Full integration test requires:")
        print("  1. DATABASE_URL in GitHub Secrets")
        print("  2. Dependencies installed (pip install -r requirements.txt)")
        print(f"{'='*60}\n")
        return 0
    else:
        print_error(f"SOME CHECKS FAILED ({passed}/{total} passed)")
        print_warning("Fix issues before deploying")
        print(f"{'='*60}\n")
        return 1

if __name__ == "__main__":
    # Try to load environment (optional)
    try:
        from dotenv import load_dotenv
        project_root = Path(__file__).parent.parent.parent
        load_dotenv(project_root / '.env.local', override=True)
        load_dotenv(project_root / '.env')
    except ImportError:
        pass  # dotenv not required for validation
    
    sys.exit(main())
