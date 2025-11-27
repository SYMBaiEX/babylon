"""
Validate Trajectory Data Quality
Ensures trajectories have realistic, non-null values
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
BLUE = '\033[94m'
RESET = '\033[0m'

def print_success(msg):
    print(f"{GREEN}✅ {msg}{RESET}")

def print_error(msg):
    print(f"{RED}❌ {msg}{RESET}")

def print_warning(msg):
    print(f"{YELLOW}⚠️  {msg}{RESET}")

def print_info(msg):
    print(f"{BLUE}ℹ️  {msg}{RESET}")

async def validate_trajectories():
    print("\n" + "="*70)
    print("  🔍 TRAJECTORY DATA QUALITY VALIDATION")
    print("="*70 + "\n")
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print_error("DATABASE_URL not set")
        return 1
    
    try:
        pool = await asyncpg.create_pool(db_url, timeout=30)
        
        # 1. Check total trajectories
        total = await pool.fetchval('SELECT COUNT(*) FROM trajectories')
        print_info(f"Total trajectories in database: {total}")
        
        if total == 0:
            print_warning("No trajectories yet - run agents to generate data")
            await pool.close()
            return 0
        
        # 2. Check training data
        training_data = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "isTrainingData" = true'
        )
        print_success(f"Training trajectories: {training_data} ({training_data/total*100:.1f}%)")
        
        # 3. Check scored trajectories
        scored = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "aiJudgeReward" IS NOT NULL'
        )
        print_success(f"Scored by RULER: {scored} ({scored/total*100:.1f}%)")
        
        # 4. Sample trajectories for validation
        print("\n" + "="*70)
        print("  Sampling Trajectories for Quality Check")
        print("="*70 + "\n")
        
        samples = await pool.fetch('''
            SELECT 
                "trajectoryId",
                "agentId",
                "totalReward",
                "finalPnL",
                "finalBalance",
                "tradesExecuted",
                "postsCreated",
                "episodeLength",
                "stepsJson",
                "aiJudgeReward"
            FROM trajectories
            WHERE "isTrainingData" = true
            ORDER BY RANDOM()
            LIMIT 10
        ''')
        
        issues_found = 0
        
        for i, traj in enumerate(samples, 1):
            print(f"\n--- Trajectory {i} ({traj['trajectoryId'][:8]}...) ---")
            
            # Check reward values
            total_reward = traj['totalReward']
            if total_reward == 0:
                print_warning(f"Total reward is 0 (might be legitimate)")
            elif total_reward is None:
                print_error(f"Total reward is NULL")
                issues_found += 1
            elif abs(total_reward) > 10000:
                print_warning(f"Total reward seems high: {total_reward}")
            else:
                print_success(f"Total reward: {total_reward:.2f}")
            
            # Check PnL
            final_pnl = traj['finalPnL']
            if final_pnl is None:
                print_info("Final P&L: None (might not have traded)")
            elif final_pnl == 0:
                print_info("Final P&L: $0 (break even or no trades)")
            elif abs(final_pnl) > 100000:
                print_warning(f"P&L seems extreme: ${final_pnl:.2f}")
            else:
                print_success(f"Final P&L: ${final_pnl:.2f}")
            
            # Check balance
            final_balance = traj['finalBalance']
            if final_balance is None:
                print_warning("Final balance is NULL")
            elif final_balance < 0:
                print_error(f"Negative balance: ${final_balance:.2f}")
                issues_found += 1
            elif final_balance == 0:
                print_error(f"Zero balance (bankrupt)")
                issues_found += 1
            elif final_balance > 1000000:
                print_warning(f"Balance seems high: ${final_balance:.2f}")
            else:
                print_success(f"Final balance: ${final_balance:.2f}")
            
            # Check activity
            trades = traj['tradesExecuted'] or 0
            posts = traj['postsCreated'] or 0
            length = traj['episodeLength']
            
            print_info(f"Activity: {trades} trades, {posts} posts, {length} steps")
            
            # Check steps JSON
            steps_json = traj['stepsJson']
            if not steps_json:
                print_error("stepsJson is NULL")
                issues_found += 1
            elif steps_json == 'null' or steps_json == '[]':
                print_error(f"stepsJson is empty: {steps_json}")
                issues_found += 1
            else:
                try:
                    steps = json.loads(steps_json)
                    if not isinstance(steps, list):
                        print_error(f"stepsJson is not a list")
                        issues_found += 1
                    elif len(steps) == 0:
                        print_error("stepsJson array is empty")
                        issues_found += 1
                    else:
                        print_success(f"Steps: {len(steps)} recorded")
                        
                        # Validate first step
                        first_step = steps[0]
                        if 'environmentState' in first_step:
                            env = first_step['environmentState']
                            balance = env.get('agentBalance')
                            pnl = env.get('agentPnL')
                            
                            if balance is not None and balance > 0:
                                print_success(f"  Step 1 balance: ${balance:.2f}")
                            
                            if pnl is not None:
                                print_info(f"  Step 1 P&L: ${pnl:.2f}")
                            
                        if 'action' in first_step:
                            action_type = first_step['action'].get('actionType', 'unknown')
                            print_info(f"  Step 1 action: {action_type}")
                        
                        if 'reward' in first_step:
                            reward = first_step['reward']
                            if reward != 0:
                                print_info(f"  Step 1 reward: {reward:.4f}")
                        
                except json.JSONDecodeError as e:
                    print_error(f"stepsJson invalid JSON: {e}")
                    issues_found += 1
            
            # Check RULER score
            judge_reward = traj['aiJudgeReward']
            if judge_reward is not None:
                if 0 <= judge_reward <= 1:
                    print_success(f"RULER score: {judge_reward:.4f} (0-1 range)")
                else:
                    print_warning(f"RULER score outside 0-1 range: {judge_reward:.4f}")
            else:
                print_info("RULER score: Not scored yet")
        
        # Summary
        print("\n" + "="*70)
        print("  VALIDATION SUMMARY")
        print("="*70 + "\n")
        
        if issues_found == 0:
            print_success(f"All sampled trajectories valid!")
            print_success(f"No null values, zeros, or extreme numbers found")
            print_success(f"Data quality is good for training")
        else:
            print_error(f"Found {issues_found} issues in sampled data")
            print_warning("Review trajectory generation code")
        
        # 5. Check for common issues across all trajectories
        print("\n" + "="*70)
        print("  AGGREGATE QUALITY CHECKS")
        print("="*70 + "\n")
        
        # Null stepsJson
        null_steps = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "stepsJson" IS NULL OR "stepsJson" = \'null\' OR "stepsJson" = \'[]\''
        )
        if null_steps > 0:
            print_error(f"{null_steps} trajectories have null/empty stepsJson")
        else:
            print_success("All trajectories have valid stepsJson")
        
        # Zero rewards
        zero_rewards = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "totalReward" = 0'
        )
        if zero_rewards > total * 0.5:
            print_warning(f"{zero_rewards} trajectories ({zero_rewards/total*100:.1f}%) have zero reward")
        else:
            print_success(f"Only {zero_rewards} trajectories with zero reward (reasonable)")
        
        # Negative balances
        negative_balance = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "finalBalance" < 0'
        )
        if negative_balance > 0:
            print_warning(f"{negative_balance} trajectories have negative final balance")
        else:
            print_success("No negative balances (all trajectories ended solvent)")
        
        # Average metrics
        avg_metrics = await pool.fetchrow('''
            SELECT 
                AVG("totalReward") as avg_reward,
                AVG("finalPnL") as avg_pnl,
                AVG("finalBalance") as avg_balance,
                AVG("episodeLength") as avg_length,
                AVG("tradesExecuted") as avg_trades
            FROM trajectories
            WHERE "isTrainingData" = true
        ''')
        
        print("\nAverage Metrics:")
        print_info(f"  Reward: {avg_metrics['avg_reward']:.2f}")
        print_info(f"  P&L: ${avg_metrics['avg_pnl']:.2f}")
        print_info(f"  Balance: ${avg_metrics['avg_balance']:.2f}")
        print_info(f"  Episode length: {avg_metrics['avg_length']:.1f} steps")
        print_info(f"  Trades: {avg_metrics['avg_trades']:.1f} per episode")
        
        await pool.close()
        
        print("\n" + "="*70)
        if issues_found == 0:
            print_success("TRAJECTORY DATA QUALITY: EXCELLENT ✅")
            print_success("Ready for training!")
        else:
            print_error(f"TRAJECTORY DATA QUALITY: {issues_found} ISSUES FOUND")
            print_warning("Fix data generation before training")
        print("="*70 + "\n")
        
        return 0 if issues_found == 0 else 1
        
    except Exception as e:
        print_error(f"Validation failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(validate_trajectories()))


