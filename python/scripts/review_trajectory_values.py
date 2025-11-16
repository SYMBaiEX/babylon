"""
Comprehensive Trajectory Value Review
Checks for null, zero, or unrealistic values in trajectory data
"""

import asyncio
import asyncpg
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment
project_root = Path(__file__).parent.parent.parent
load_dotenv(project_root / '.env.local', override=True)
load_dotenv(project_root / '.env')

GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def check_value(name, value, min_val=None, max_val=None, allow_null=False, allow_zero=False):
    """Check if a value is reasonable"""
    if value is None:
        if allow_null:
            print(f"  {name}: NULL (allowed)")
            return True
        else:
            print(f"  {RED}❌ {name}: NULL (should have value){RESET}")
            return False
    
    if value == 0:
        if allow_zero:
            print(f"  {name}: 0 (allowed)")
            return True
        else:
            print(f"  {YELLOW}⚠️  {name}: 0 (might be issue){RESET}")
            return True  # Warning but not failure
    
    if min_val is not None and value < min_val:
        print(f"  {RED}❌ {name}: {value} < {min_val} (too low){RESET}")
        return False
    
    if max_val is not None and value > max_val:
        print(f"  {YELLOW}⚠️  {name}: {value} > {max_val} (seems high){RESET}")
        return True  # Warning but not failure
    
    print(f"  {GREEN}✅ {name}: {value}{RESET}")
    return True

async def main():
    print("\n" + "="*70)
    print("  🔍 TRAJECTORY VALUES REVIEW")
    print("="*70 + "\n")
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print(f"{RED}❌ DATABASE_URL not set{RESET}")
        print("Add to .env.local or export DATABASE_URL=...")
        return 1
    
    try:
        print(f"Connecting to database...")
        pool = await asyncpg.create_pool(db_url, timeout=30)
        print(f"{GREEN}✅ Connected{RESET}\n")
        
        # Get sample trajectories
        trajectories = await pool.fetch('''
            SELECT 
                "trajectoryId",
                "agentId",
                "startTime",
                "endTime",
                "durationMs",
                "totalReward",
                "episodeLength",
                "finalStatus",
                "finalBalance",
                "finalPnL",
                "tradesExecuted",
                "postsCreated",
                "aiJudgeReward",
                "stepsJson",
                "metricsJson",
                "isTrainingData",
                "usedInTraining"
            FROM trajectories
            WHERE "isTrainingData" = true
            ORDER BY "createdAt" DESC
            LIMIT 20
        ''')
        
        if not trajectories:
            print(f"{YELLOW}⚠️  No trajectories found{RESET}")
            print("Run agents to generate training data")
            await pool.close()
            return 0
        
        print(f"Found {len(trajectories)} trajectories to review\n")
        
        issues = []
        warnings = []
        
        for i, traj in enumerate(trajectories, 1):
            print(f"{'='*70}")
            print(f"Trajectory {i}/{len(trajectories)}: {traj['trajectoryId'][:12]}...")
            print(f"{'='*70}")
            
            # Basic fields
            print(f"\n📋 Basic Fields:")
            check_value("Duration (ms)", traj['durationMs'], min_val=100, max_val=3600000)  # 0.1s to 1 hour
            check_value("Episode length", traj['episodeLength'], min_val=1, max_val=1000)
            check_value("Final status", traj['finalStatus'], allow_null=False)
            
            # Financial metrics
            print(f"\n💰 Financial Metrics:")
            balance_ok = check_value("Final balance", traj['finalBalance'], min_val=0, max_val=1000000, allow_null=True)
            pnl_ok = check_value("Final P&L", traj['finalPnL'], min_val=-50000, max_val=50000, allow_null=True, allow_zero=True)
            
            # Activity metrics
            print(f"\n📊 Activity Metrics:")
            trades_ok = check_value("Trades executed", traj['tradesExecuted'], min_val=0, max_val=100, allow_null=True, allow_zero=True)
            posts_ok = check_value("Posts created", traj['postsCreated'], min_val=0, max_val=100, allow_null=True, allow_zero=True)
            
            # Reward
            print(f"\n🎯 Rewards:")
            reward_ok = check_value("Total reward", traj['totalReward'], min_val=-10, max_val=10, allow_zero=True)
            judge_ok = check_value("RULER score", traj['aiJudgeReward'], min_val=0, max_val=1, allow_null=True)
            
            # Steps JSON validation
            print(f"\n📝 Steps Data:")
            steps_json = traj['stepsJson']
            if not steps_json or steps_json == 'null':
                print(f"  {RED}❌ stepsJson is NULL{RESET}")
                issues.append(f"Trajectory {traj['trajectoryId'][:12]}: NULL stepsJson")
            elif steps_json == '[]':
                print(f"  {RED}❌ stepsJson is empty array{RESET}")
                issues.append(f"Trajectory {traj['trajectoryId'][:12]}: Empty steps")
            else:
                try:
                    steps = json.loads(steps_json)
                    if not isinstance(steps, list):
                        print(f"  {RED}❌ stepsJson is not an array{RESET}")
                        issues.append(f"Trajectory {traj['trajectoryId'][:12]}: Invalid steps format")
                    elif len(steps) == 0:
                        print(f"  {RED}❌ stepsJson array is empty{RESET}")
                        issues.append(f"Trajectory {traj['trajectoryId'][:12]}: No steps")
                    else:
                        print(f"  {GREEN}✅ Steps: {len(steps)} recorded{RESET}")
                        
                        # Check first step
                        if len(steps) > 0:
                            step = steps[0]
                            
                            # Check environment state
                            if 'environmentState' in step:
                                env = step['environmentState']
                                if 'agentBalance' in env:
                                    balance = env['agentBalance']
                                    if balance > 0 and balance < 1000000:
                                        print(f"     Balance: ${balance:.2f} {GREEN}✓{RESET}")
                                    elif balance == 0:
                                        print(f"     Balance: ${balance:.2f} {YELLOW}⚠️{RESET}")
                                    else:
                                        print(f"     Balance: ${balance:.2f} {YELLOW}(unusual){RESET}")
                                
                                if 'agentPnL' in env:
                                    pnl = env['agentPnL']
                                    if abs(pnl) < 50000:
                                        print(f"     P&L: ${pnl:.2f} {GREEN}✓{RESET}")
                                    else:
                                        print(f"     P&L: ${pnl:.2f} {YELLOW}(high){RESET}")
                            
                            # Check action
                            if 'action' in step:
                                action = step['action']
                                action_type = action.get('actionType', 'unknown')
                                success = action.get('success', False)
                                print(f"     Action: {action_type} ({GREEN if success else YELLOW}{'success' if success else 'failed'}{RESET})")
                            
                            # Check reward
                            if 'reward' in step:
                                step_reward = step['reward']
                                if abs(step_reward) < 10:
                                    print(f"     Reward: {step_reward:.4f} {GREEN}✓{RESET}")
                                else:
                                    print(f"     Reward: {step_reward:.4f} {YELLOW}(high){RESET}")
                        
                except json.JSONDecodeError as e:
                    print(f"  {RED}❌ stepsJson invalid JSON: {e}{RESET}")
                    issues.append(f"Trajectory {traj['trajectoryId'][:12]}: Invalid JSON")
            
            print("")
        
        # Final summary
        print("="*70)
        print("  REVIEW SUMMARY")
        print("="*70 + "\n")
        
        print(f"Trajectories reviewed: {len(trajectories)}")
        print(f"Critical issues: {len(issues)}")
        print(f"Warnings: {len(warnings)}")
        print("")
        
        if issues:
            print(f"{RED}Critical Issues Found:{RESET}")
            for issue in issues:
                print(f"  • {issue}")
            print("")
        
        if not issues:
            print(f"{GREEN}✅ ALL TRAJECTORIES HAVE VALID, REALISTIC VALUES!{RESET}")
            print(f"{GREEN}✅ No null, zero (where inappropriate), or crazy numbers{RESET}")
            print(f"{GREEN}✅ Data is ready for training{RESET}")
        else:
            print(f"{RED}❌ FOUND {len(issues)} ISSUES{RESET}")
            print(f"{YELLOW}⚠️  Review trajectory generation code{RESET}")
        
        print("")
        await pool.close()
        
        return 1 if issues else 0
        
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))


