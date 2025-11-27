"""
Complete RL Loop End-to-End Test
Tests every step of the pipeline with actual data validation
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

def print_step(num, name):
    print(f"\n{'='*70}")
    print(f"  STEP {num}: {name}")
    print(f"{'='*70}\n")

async def test_complete_rl_loop():
    """Test every step of the RL loop"""
    
    print("\n" + "="*70)
    print("  🧪 COMPLETE RL LOOP END-TO-END TEST")
    print("  Testing with ACTUAL data validation")
    print("="*70 + "\n")
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print_error("DATABASE_URL not set in environment")
        print_info("Add to .env.local or .env file")
        return 1
    
    issues_found = []
    warnings_found = []
    
    try:
        # Connect to database
        print_step(1, "Database Connection")
        pool = await asyncpg.create_pool(db_url, min_size=1, max_size=2, timeout=30)
        print_success(f"Connected to PostgreSQL")
        
        # ============================================================
        # STEP 2: Check for Training Data
        # ============================================================
        print_step(2, "Check Training Data Exists")
        
        total_trajectories = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories'
        )
        print_info(f"Total trajectories: {total_trajectories}")
        
        if total_trajectories == 0:
            print_error("No trajectories in database!")
            print_warning("Run agents to generate training data first")
            issues_found.append("No trajectories - cannot test RL loop")
            await pool.close()
            return 1
        
        training_data = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "isTrainingData" = true'
        )
        print_success(f"Training trajectories: {training_data}")
        
        if training_data == 0:
            print_error("No trajectories marked as training data!")
            issues_found.append("isTrainingData flag not set")
        
        # ============================================================
        # STEP 3: Validate Trajectory Data Quality
        # ============================================================
        print_step(3, "Validate Trajectory Data")
        
        # Get sample trajectory
        sample = await pool.fetchrow('''
            SELECT 
                "trajectoryId",
                "agentId",
                "stepsJson",
                "totalReward",
                "finalPnL",
                "finalBalance",
                "episodeLength",
                "aiJudgeReward"
            FROM trajectories
            WHERE "isTrainingData" = true
            LIMIT 1
        ''')
        
        if not sample:
            print_error("Could not fetch sample trajectory")
            issues_found.append("No training trajectories available")
        else:
            traj_id = sample['trajectoryId']
            print_info(f"Examining trajectory: {traj_id[:12]}...")
            
            # Check for NULL values
            if sample['stepsJson'] is None:
                print_error("stepsJson is NULL!")
                issues_found.append(f"Trajectory {traj_id[:8]}: NULL stepsJson")
            elif sample['stepsJson'] == 'null':
                print_error("stepsJson is string 'null'!")
                issues_found.append(f"Trajectory {traj_id[:8]}: stepsJson='null'")
            elif sample['stepsJson'] == '[]':
                print_error("stepsJson is empty array!")
                issues_found.append(f"Trajectory {traj_id[:8]}: Empty steps")
            else:
                try:
                    steps = json.loads(sample['stepsJson'])
                    if not isinstance(steps, list):
                        print_error(f"stepsJson is not an array: {type(steps)}")
                        issues_found.append(f"Invalid steps type")
                    elif len(steps) == 0:
                        print_error("stepsJson array is empty")
                        issues_found.append(f"No steps in trajectory")
                    else:
                        print_success(f"Steps: {len(steps)} recorded")
                        
                        # Validate first step structure
                        step1 = steps[0]
                        
                        # Check environmentState
                        if 'environmentState' not in step1:
                            print_error("Step missing environmentState")
                            issues_found.append("Missing environmentState")
                        else:
                            env = step1['environmentState']
                            
                            # Check critical fields
                            balance = env.get('agentBalance')
                            pnl = env.get('agentPnL')
                            
                            if balance is None:
                                print_warning("agentBalance is NULL in step")
                                warnings_found.append("NULL balance in step")
                            elif balance == 0:
                                print_warning(f"agentBalance is 0")
                            elif balance < 0:
                                print_error(f"Negative balance: ${balance}")
                                issues_found.append(f"Negative balance: {balance}")
                            else:
                                print_success(f"Step 1 balance: ${balance:.2f}")
                            
                            if pnl is not None:
                                print_info(f"Step 1 P&L: ${pnl:.2f}")
                        
                        # Check action
                        if 'action' not in step1:
                            print_error("Step missing action")
                            issues_found.append("Missing action")
                        else:
                            action = step1['action']
                            action_type = action.get('actionType', 'MISSING')
                            
                            if action_type == 'MISSING':
                                print_error("Action missing actionType")
                                issues_found.append("No actionType")
                            elif action_type == '':
                                print_error("Empty actionType")
                                issues_found.append("Empty actionType")
                            else:
                                print_success(f"Action type: {action_type}")
                        
                        # Check reward
                        if 'reward' in step1:
                            reward = step1['reward']
                            if reward is None:
                                print_warning("Step reward is NULL")
                            else:
                                print_info(f"Step 1 reward: {reward:.4f}")
                        
                except json.JSONDecodeError as e:
                    print_error(f"stepsJson is invalid JSON: {e}")
                    issues_found.append("Invalid JSON in stepsJson")
            
            # Check trajectory-level fields
            if sample['totalReward'] is None:
                print_error("totalReward is NULL")
                issues_found.append("NULL totalReward")
            else:
                print_success(f"Total reward: {sample['totalReward']:.4f}")
            
            if sample['episodeLength'] is None or sample['episodeLength'] == 0:
                print_error(f"Invalid episode length: {sample['episodeLength']}")
                issues_found.append("Invalid episodeLength")
            else:
                print_success(f"Episode length: {sample['episodeLength']} steps")
            
            # Check RULER score
            if sample['aiJudgeReward'] is None:
                print_info("RULER score: Not scored yet (OK)")
            elif sample['aiJudgeReward'] < 0 or sample['aiJudgeReward'] > 1:
                print_error(f"RULER score out of range: {sample['aiJudgeReward']}")
                issues_found.append(f"Invalid RULER score: {sample['aiJudgeReward']}")
            else:
                print_success(f"RULER score: {sample['aiJudgeReward']:.4f}")
        
        # ============================================================
        # STEP 4: Check RULER Scoring Works
        # ============================================================
        print_step(4, "RULER Scoring Validation")
        
        scored_count = await pool.fetchval(
            'SELECT COUNT(*) FROM trajectories WHERE "aiJudgeReward" IS NOT NULL'
        )
        
        if scored_count == 0:
            print_warning("No trajectories have been scored by RULER yet")
            print_info("Run: curl https://your-app.vercel.app/api/cron/training-check")
            warnings_found.append("No RULER scores yet")
        else:
            print_success(f"Scored trajectories: {scored_count}")
            
            # Check score distribution
            score_stats = await pool.fetchrow('''
                SELECT 
                    MIN("aiJudgeReward") as min_score,
                    MAX("aiJudgeReward") as max_score,
                    AVG("aiJudgeReward") as avg_score
                FROM trajectories
                WHERE "aiJudgeReward" IS NOT NULL
            ''')
            
            print_info(f"RULER score range: {score_stats['min_score']:.4f} - {score_stats['max_score']:.4f}")
            print_info(f"Average score: {score_stats['avg_score']:.4f}")
            
            # Validate range
            if score_stats['min_score'] < 0:
                print_error(f"RULER scores below 0: {score_stats['min_score']}")
                issues_found.append("RULER scores out of range (< 0)")
            
            if score_stats['max_score'] > 1:
                print_error(f"RULER scores above 1: {score_stats['max_score']}")
                issues_found.append("RULER scores out of range (> 1)")
        
        # ============================================================
        # STEP 5: Check Training Readiness
        # ============================================================
        print_step(5, "Training Readiness Check")
        
        ready_for_training = await pool.fetchval('''
            SELECT COUNT(*) FROM trajectories 
            WHERE "isTrainingData" = true 
            AND "usedInTraining" = false
            AND "aiJudgeReward" IS NOT NULL
            AND "stepsJson" IS NOT NULL
            AND "stepsJson"::text != 'null'
            AND "stepsJson"::text != '[]'
        ''')
        
        print_info(f"Trajectories ready for training: {ready_for_training}")
        
        if ready_for_training >= 1:
            print_success(f"✅ READY: {ready_for_training} >= 1 (threshold)")
            print_info("Training will trigger!")
        else:
            print_warning("Not ready for training (need at least 1 scored trajectory)")
            print_info("Generate more data and run RULER scoring")
            warnings_found.append("Not enough data for training")
        
        # ============================================================
        # STEP 6: Check Training Batches
        # ============================================================
        print_step(6, "Training Batch History")
        
        batch_count = await pool.fetchval('SELECT COUNT(*) FROM training_batches')
        
        if batch_count == 0:
            print_info("No training batches yet (expected for new deployment)")
        else:
            print_success(f"Training batches: {batch_count}")
            
            # Check latest batch
            latest_batch = await pool.fetchrow('''
                SELECT "batchId", status, "createdAt", "completedAt", error
                FROM training_batches
                ORDER BY "createdAt" DESC
                LIMIT 1
            ''')
            
            if latest_batch:
                print_info(f"Latest batch: {latest_batch['batchId']}")
                print_info(f"Status: {latest_batch['status']}")
                
                if latest_batch['status'] == 'failed':
                    print_error(f"Last batch failed!")
                    if latest_batch['error']:
                        print_error(f"Error: {latest_batch['error']}")
                    issues_found.append("Last training batch failed")
                elif latest_batch['status'] == 'completed':
                    print_success("Last batch completed successfully")
                elif latest_batch['status'] == 'training':
                    print_info("Batch currently training...")
        
        # ============================================================
        # STEP 7: Check Trained Models
        # ============================================================
        print_step(7, "Trained Models Check")
        
        model_count = await pool.fetchval('SELECT COUNT(*) FROM trained_models')
        
        if model_count == 0:
            print_info("No trained models yet (expected until first training completes)")
        else:
            print_success(f"Trained models: {model_count}")
            
            # Check latest model
            latest_model = await pool.fetchrow('''
                SELECT 
                    "modelId",
                    version,
                    "storagePath",
                    status,
                    "baseModel",
                    "avgReward",
                    "benchmarkScore",
                    "deployedAt"
                FROM trained_models
                ORDER BY "createdAt" DESC
                LIMIT 1
            ''')
            
            if latest_model:
                print_info(f"Latest model: {latest_model['modelId']}")
                print_info(f"Version: {latest_model['version']}")
                print_info(f"Status: {latest_model['status']}")
                
                # Validate model fields
                if not latest_model['storagePath']:
                    print_error("Model missing storagePath (W&B model ID)")
                    issues_found.append("Model missing W&B path")
                else:
                    print_success(f"W&B path: {latest_model['storagePath']}")
                
                if not latest_model['baseModel']:
                    print_error("Model missing baseModel")
                    issues_found.append("Model missing baseModel")
                else:
                    if latest_model['baseModel'] != 'OpenPipe/Qwen3-14B-Instruct':
                        print_warning(f"Unexpected base model: {latest_model['baseModel']}")
                        print_warning("Should be: OpenPipe/Qwen3-14B-Instruct")
                    else:
                        print_success(f"Base model: {latest_model['baseModel']}")
                
                if latest_model['status'] == 'deployed':
                    print_success(f"Model is deployed (ready for use)")
                    print_info(f"Deployed at: {latest_model['deployedAt']}")
                elif latest_model['status'] == 'ready':
                    print_info("Model is ready but not deployed yet")
                    print_info("Will auto-deploy on next cron cycle")
                else:
                    print_warning(f"Model status: {latest_model['status']}")
        
        # ============================================================
        # STEP 8: Summary
        # ============================================================
        print("\n" + "="*70)
        print("  📊 TEST SUMMARY")
        print("="*70 + "\n")
        
        print(f"Issues found: {len(issues_found)}")
        print(f"Warnings: {len(warnings_found)}")
        print("")
        
        if issues_found:
            print_error("CRITICAL ISSUES:")
            for issue in issues_found:
                print(f"  • {issue}")
            print("")
        
        if warnings_found:
            print_warning("WARNINGS:")
            for warning in warnings_found:
                print(f"  • {warning}")
            print("")
        
        if not issues_found and not warnings_found:
            print_success("ALL CHECKS PASSED!")
            print_success("RL loop is ready to run end-to-end")
            print("")
            print_info("Next steps:")
            print_info("  1. Ensure RULER scoring runs (hourly cron)")
            print_info("  2. Trigger training (GitHub Actions)")
            print_info("  3. Verify model created")
            print_info("  4. Test agent uses trained model")
        elif not issues_found:
            print_success("NO CRITICAL ISSUES!")
            print_warning(f"Found {len(warnings_found)} warnings (not blockers)")
            print("")
            print_info("Can proceed but may want to address warnings")
        else:
            print_error(f"FOUND {len(issues_found)} CRITICAL ISSUES")
            print_error("Fix these before deploying training system")
        
        print("")
        await pool.close()
        
        return 1 if issues_found else 0
        
    except Exception as e:
        print_error(f"Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(test_complete_rl_loop()))


