#!/usr/bin/env python3
"""
Babylon Local Training Script for Apple Silicon (MLX)

This script demonstrates the complete training pipeline:
1. Generate complete training data with full validation
2. Prepare data in JSONL format for MLX
3. Train a small model using LoRA fine-tuning
4. Validate each step of the process

Usage:
    python scripts/train_local_mlx.py --model mlx-community/Qwen2.5-3B-Instruct-4bit
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from typing import List, Dict

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def print_section(title: str):
    """Print a section header"""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70 + "\n")




# ============================================================
# STEP 1: DATA GENERATION
# ============================================================

def generate_training_data(num_trajectories: int = 10, steps_per_trajectory: int = 15):
    """
    Generate complete training data with all agent tick information.
    
    Returns trajectories with:
    - Full LLM calls (system, user, assistant)
    - Complete reasoning chains
    - Actions with parameters
    - Environment state
    - Rewards
    """
    print_section("STEP 1: DATA GENERATION")
    
    from src.training import (
        FastSimulator,
        SimulatorConfig,
        AgentTickData,
        build_trajectory_from_ticks,
        calculate_trajectory_quality_score,
        validate_trajectory_quality,
        # Tick-level reward attribution
        TickRewardAttributor,
        TickData,
        TickOutcome,
        LLMCallRecord,
        CallPurpose,
    )
    from src.models import LLMCall, Action, EnvironmentState
    
    import random
    
    # Create realistic mock agents with different skill levels and strategies
    class TradingAgent:
        def __init__(self, agent_id: str, strategy: str, skill_level: float):
            self.agent_id = agent_id
            self.strategy = strategy
            self.skill_level = skill_level  # 0.0 = poor, 1.0 = excellent
            self.tick_count = 0
            self.cumulative_pnl = 0.0
            self.wins = 0
            self.losses = 0
            
        async def run_tick(
            self,
            agent_id: str,
            observation: dict,
            env_state: EnvironmentState,
        ) -> AgentTickData:
            self.tick_count += 1
            
            markets = observation.get('markets', [])
            news = observation.get('news', [])
            
            # Simulate trade outcomes based on skill level
            # Skilled agents make better decisions and get better outcomes
            trade_success = random.random() < (0.3 + 0.5 * self.skill_level)
            
            # Build detailed reasoning based on strategy and skill
            if self.strategy == 'technical':
                if self.skill_level > 0.7:
                    reasoning = (
                        f"Technical Analysis (Tick {self.tick_count}):\n"
                        f"1. Market Overview: {len(markets)} active markets with clear patterns\n"
                        f"2. Current State: Balance=${env_state.agent_balance:.2f}, P&L=${self.cumulative_pnl:.2f}\n"
                        f"3. Open Positions: {env_state.open_positions}\n"
                        f"4. Signal Strength: Strong breakout pattern detected on high volume\n"
                        f"5. Risk/Reward: 3:1 ratio confirmed, position size within 2% risk rule\n"
                        f"6. Entry: Clear support level at current price, stop loss defined"
                    )
                else:
                    reasoning = (
                        f"Technical Analysis (Tick {self.tick_count}):\n"
                        f"1. Market Overview: Looking at {len(markets)} markets\n"
                        f"2. Balance: ${env_state.agent_balance:.2f}\n"
                        f"3. Strategy: I think I see a pattern here\n"
                        f"4. Decision: Going to buy because price looks low"
                    )
                action_type = ['buy', 'sell', 'wait'][self.tick_count % 3]
                
            elif self.strategy == 'fundamental':
                if self.skill_level > 0.7:
                    reasoning = (
                        f"Fundamental Analysis (Tick {self.tick_count}):\n"
                        f"1. News Analysis: {len(news)} events - Fed policy shift is bullish\n"
                        f"2. Macro Environment: Rate cuts historically boost risk assets\n"
                        f"3. Portfolio Status: {env_state.open_positions} positions, ${self.cumulative_pnl:.2f} P&L\n"
                        f"4. Valuation: Markets pricing 65% probability seems undervalued\n"
                        f"5. Catalyst: Upcoming earnings could drive revaluation\n"
                        f"6. Position: Scaling in with 25% of intended size"
                    )
                else:
                    reasoning = (
                        f"Fundamental Analysis (Tick {self.tick_count}):\n"
                        f"1. Saw some news: {len(news)} items\n"
                        f"2. Balance: ${env_state.agent_balance:.2f}\n"
                        f"3. Thinking: News seems positive\n"
                        f"4. Waiting to see what happens"
                    )
                action_type = 'wait' if self.tick_count % 4 != 0 else 'buy'
                
            elif self.strategy == 'momentum':
                if self.skill_level > 0.7:
                    reasoning = (
                        f"Momentum Strategy (Tick {self.tick_count}):\n"
                        f"1. Trend Scan: {len(markets)} markets analyzed for momentum\n"
                        f"2. Performance: P&L=${self.cumulative_pnl:.2f}, Win rate={self.wins}/{self.wins+self.losses}\n"
                        f"3. Signal: RSI and MACD confirming trend continuation\n"
                        f"4. Volume: Above average, confirming institutional participation\n"
                        f"5. Execution: Trailing stop at 1.5 ATR, letting winners run\n"
                        f"6. Risk: Cutting position if momentum reverses"
                    )
                else:
                    reasoning = (
                        f"Momentum Strategy (Tick {self.tick_count}):\n"
                        f"1. Markets: {len(markets)} available\n"
                        f"2. Price is moving up, buying more\n"
                        f"3. No stop loss set"
                    )
                action_type = 'buy' if self.tick_count % 2 == 0 else 'sell'
                
            else:  # conservative
                if self.skill_level > 0.7:
                    reasoning = (
                        f"Risk-Adjusted Strategy (Tick {self.tick_count}):\n"
                        f"1. Portfolio Review: ${env_state.agent_balance:.2f}, Sharpe ratio tracking\n"
                        f"2. Risk Metrics: VaR within limits, correlation exposure acceptable\n"
                        f"3. Position Size: {env_state.open_positions} positions, max 5% per trade\n"
                        f"4. Hedging: Considering protective puts if volatility spikes\n"
                        f"5. Rebalancing: Current allocation optimal for risk tolerance"
                    )
                else:
                    reasoning = (
                        f"Conservative Approach (Tick {self.tick_count}):\n"
                        f"1. Balance: ${env_state.agent_balance:.2f}\n"
                        f"2. Not sure what to do\n"
                        f"3. Waiting and watching"
                    )
                action_type = 'wait' if self.tick_count % 6 != 0 else 'buy'
            
            # Simulate PnL changes based on trade outcomes
            pnl_change = 0.0
            if action_type in ['buy', 'sell']:
                if trade_success:
                    pnl_change = random.uniform(50, 200) * self.skill_level
                    self.wins += 1
                else:
                    pnl_change = -random.uniform(30, 150) * (1 - self.skill_level * 0.5)
                    self.losses += 1
                self.cumulative_pnl += pnl_change
            
            # Create comprehensive LLM calls
            system_prompt = f"""You are {self.agent_id}, a {self.strategy} trading agent in Babylon prediction markets.

Your trading philosophy:
- {self.strategy.upper()} approach to market analysis
- Systematic risk management
- Data-driven decision making

Current Session Stats:
- Starting Balance: $10,000
- Current Balance: ${env_state.agent_balance:.2f}
- Session P&L: ${env_state.agent_pnl:.2f}
- Open Positions: {env_state.open_positions}

Make thoughtful decisions based on available market data."""

            user_prompt_reasoning = f"""Market Update at Tick {self.tick_count}:
            
Active Markets: {len(markets)}
{json.dumps(markets[:2], indent=2) if markets else 'No market data'}

Recent News: {len(news)} items
{json.dumps(news[:1], indent=2) if news else 'No news'}

Your Current State:
- Balance: ${env_state.agent_balance:.2f}
- P&L: ${env_state.agent_pnl:.2f}
- Positions: {env_state.open_positions}

Analyze this market update and explain your thinking."""

            user_prompt_action = f"""Based on your analysis, what action should you take?

Options:
- buy: Enter a new position
- sell: Close or reduce a position
- wait: Hold current positions

Your balance: ${env_state.agent_balance:.2f}
Your positions: {env_state.open_positions}

Decide on your action."""

            llm_calls = [
                LLMCall(
                    model='qwen2.5-3b-instruct',
                    system_prompt=system_prompt,
                    user_prompt=user_prompt_reasoning,
                    response=reasoning,
                    reasoning=reasoning,
                    temperature=0.7,
                    max_tokens=1000,
                    purpose='reasoning',
                ),
                LLMCall(
                    model='qwen2.5-3b-instruct',
                    system_prompt=system_prompt,
                    user_prompt=user_prompt_action,
                    response=f"I will {action_type}.\n\n{reasoning}",
                    reasoning=f"Decision: {action_type} based on {self.strategy} analysis",
                    temperature=0.7,
                    max_tokens=500,
                    purpose='action',
                    action_type=action_type,
                ),
            ]
            
            # Create action with parameters and realistic outcomes
            params = {}
            action_success = True
            if action_type in ['buy', 'sell']:
                params = {
                    'amount': 100,
                    'market_id': markets[0]['id'] if markets else 'default',
                    'confidence': 0.5 + (0.4 * self.skill_level),
                    'pnl_change': pnl_change,
                }
                action_success = trade_success
            
            action = Action(
                action_type=action_type,
                parameters=params,
                success=action_success,
                reasoning=reasoning,
                result={'pnl_delta': pnl_change} if action_type in ['buy', 'sell'] else None,
                error=None if action_success else "Trade executed at unfavorable price",
            )
            
            # Calculate reward based on actual performance
            reward = 0.0
            if action_type in ['buy', 'sell']:
                # Reward based on P&L outcome
                reward = max(-1.0, min(1.0, pnl_change / 100.0))  # Normalize to [-1, 1]
            if self.cumulative_pnl > 0:
                reward += 0.1  # Bonus for overall profitability
            
            return AgentTickData(
                tick_number=self.tick_count,
                timestamp=int(datetime.now(timezone.utc).timestamp() * 1000),
                observation=observation,
                environment_state=env_state,
                llm_calls=llm_calls,
                reasoning_chain=reasoning,
                action=action,
                feedback={'tick': self.tick_count, 'strategy': self.strategy},
                reward=reward,
            )
    
    # Run simulation
    async def run_simulation():
        config = SimulatorConfig(
            mode='data_generation',
            max_ticks=steps_per_trajectory,
            max_concurrent_agents=num_trajectories,
            min_actions_per_trajectory=3,
        )
        
        simulator = FastSimulator(config)
        await simulator.initialize()
        
        # Create agents with different strategies AND skill levels
        # This ensures diverse outcomes for GRPO training
        strategies = ['technical', 'fundamental', 'momentum', 'conservative']
        skill_levels = [0.9, 0.75, 0.6, 0.4, 0.25, 0.1]  # Range from excellent to poor
        agents = {}
        for i in range(num_trajectories):
            agent_id = f'agent-{i+1}'
            strategy = strategies[i % len(strategies)]
            skill = skill_levels[i % len(skill_levels)]
            agents[agent_id] = TradingAgent(agent_id, strategy, skill)
        
        # Set up initial market state
        simulator.game_state.markets = [
            {'id': 'btc-100k', 'question': 'Will BTC hit $100k by EOY?', 'probability': 0.65, 'volume': 1500000},
            {'id': 'eth-flip', 'question': 'Will ETH flip BTC market cap?', 'probability': 0.12, 'volume': 850000},
            {'id': 'fed-rates', 'question': 'Will Fed cut rates in Q1?', 'probability': 0.78, 'volume': 2100000},
        ]
        simulator.game_state.news = [
            {'headline': 'Fed signals potential rate cuts', 'sentiment': 'bullish', 'impact': 'high'},
            {'headline': 'Institutional crypto adoption accelerates', 'sentiment': 'bullish', 'impact': 'medium'},
        ]
        
        # Run simulation
        for tick in range(steps_per_trajectory):
            await simulator.run_tick(agents)
        
        await simulator.cleanup()
        return simulator
    
    simulator = asyncio.run(run_simulation())
    
    # Build trajectories with outcome-based scoring
    trajectories = []
    quality_scores = []
    
    print("Generated Trajectories:")
    print("-" * 60)
    
    for agent_id, ticks in simulator.agent_trajectories.items():
        traj_id = f'traj-{agent_id}-{int(datetime.now().timestamp())}'
        traj = build_trajectory_from_ticks(traj_id, agent_id, ticks)
        
        if traj:
            # Calculate quality based on ACTUAL OUTCOMES, not just data completeness
            base_quality = calculate_trajectory_quality_score(ticks)
            
            # Adjust score based on cumulative P&L (this is what we want to optimize)
            total_reward = sum(t.reward for t in ticks)
            pnl_score = max(0.0, min(1.0, (total_reward + 2) / 4))  # Normalize reward range
            
            # Count win rate
            wins = sum(1 for t in ticks if t.action and t.action.success and t.action.action_type in ['buy', 'sell'])
            trades = sum(1 for t in ticks if t.action and t.action.action_type in ['buy', 'sell'])
            win_rate = wins / trades if trades > 0 else 0.5
            
            # Combined score: data quality (30%) + P&L (50%) + win rate (20%)
            combined_score = 0.3 * base_quality + 0.5 * pnl_score + 0.2 * win_rate
            
            validation = validate_trajectory_quality(ticks, min_ticks=5, min_quality_score=0.3)
            
            trajectories.append(traj)
            quality_scores.append(combined_score)
            
            print(f"  {agent_id}:")
            print(f"    Steps: {len(traj.steps)}")
            print(f"    Trades: {trades}")
            print(f"    Win Rate: {win_rate:.1%}")
            print(f"    Total Reward: {total_reward:.2f}")
            print(f"    Score: {combined_score:.3f}")
    
    print("-" * 60)
    print(f"Total: {len(trajectories)} trajectories")
    print(f"Score Range: {min(quality_scores):.3f} - {max(quality_scores):.3f}")
    print(f"Score Variance: {sum((s - sum(quality_scores)/len(quality_scores))**2 for s in quality_scores) / len(quality_scores):.4f}")
    
    return trajectories, quality_scores


# ============================================================
# STEP 2: DATA VALIDATION
# ============================================================

def validate_data_completeness(trajectories, quality_scores):
    """
    Thoroughly validate that all data is complete and correct.
    """
    print_section("STEP 2: DATA VALIDATION")
    
    total_steps = 0
    total_llm_calls = 0
    total_actions = 0
    issues = []
    
    for i, traj in enumerate(trajectories):
        print(f"\nTrajectory {i+1}: {traj.agent_id}")
        print("-" * 40)
        
        for step in traj.steps:
            total_steps += 1
            
            # Check LLM calls
            if not step.llm_calls:
                issues.append(f"{traj.agent_id} step {step.step_number}: No LLM calls")
            else:
                for j, call in enumerate(step.llm_calls):
                    total_llm_calls += 1
                    
                    # Validate each field
                    if not call.system_prompt:
                        issues.append(f"{traj.agent_id} step {step.step_number} call {j}: Missing system_prompt")
                    if not call.user_prompt:
                        issues.append(f"{traj.agent_id} step {step.step_number} call {j}: Missing user_prompt")
                    if not call.response:
                        issues.append(f"{traj.agent_id} step {step.step_number} call {j}: Missing response")
                    if not call.purpose:
                        issues.append(f"{traj.agent_id} step {step.step_number} call {j}: Missing purpose")
            
            # Check action
            if step.action:
                total_actions += 1
                if not step.action.action_type:
                    issues.append(f"{traj.agent_id} step {step.step_number}: Action missing type")
            
            # Check environment state
            if step.environment_state is None:
                issues.append(f"{traj.agent_id} step {step.step_number}: Missing environment_state")
        
        # Show sample step
        if traj.steps:
            sample_step = traj.steps[0]
            print(f"  Sample Step (#{sample_step.step_number}):")
            print(f"    LLM Calls: {len(sample_step.llm_calls)}")
            if sample_step.llm_calls:
                call = sample_step.llm_calls[0]
                print(f"      [0] Purpose: {call.purpose}")
                print(f"          System: {len(call.system_prompt)} chars")
                print(f"          User: {len(call.user_prompt)} chars")
                print(f"          Response: {len(call.response)} chars")
            print(f"    Action: {sample_step.action.action_type if sample_step.action else 'None'}")
            print(f"    Balance: ${sample_step.environment_state.agent_balance:.2f}")
            print(f"    Reward: {sample_step.reward}")
    
    print(f"\n{'='*60}")
    print("VALIDATION SUMMARY")
    print(f"{'='*60}")
    print(f"  Total Steps: {total_steps}")
    print(f"  Total LLM Calls: {total_llm_calls}")
    print(f"  Total Actions: {total_actions}")
    print(f"  Calls per Step: {total_llm_calls/total_steps:.1f}")
    
    if issues:
        print(f"\n  ⚠️  Issues Found: {len(issues)}")
        for issue in issues[:5]:
            print(f"    - {issue}")
        if len(issues) > 5:
            print(f"    ... and {len(issues)-5} more")
        return False
    else:
        print(f"\n  ✅ All data validated successfully!")
        return True


# ============================================================
# STEP 3: PREPARE TRAINING FORMAT
# ============================================================

def prepare_training_data(trajectories, quality_scores, output_dir: str):
    """
    Prepare training data in JSONL format for MLX LoRA training.
    
    Format: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
    """
    print_section("STEP 3: PREPARE TRAINING FORMAT")
    
    from src.training import MultiPromptDatasetBuilder
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Build multi-prompt dataset
    builder = MultiPromptDatasetBuilder()
    
    for traj, score in zip(trajectories, quality_scores):
        builder.add_trajectory(traj, trajectory_score=score)
    
    stats = builder.get_statistics()
    print("Multi-Prompt Dataset Statistics:")
    print(f"  Total Trajectories: {stats['total_trajectories']}")
    print(f"  Total Steps: {stats['total_steps']}")
    print(f"  Total Samples: {stats['total_samples']}")
    
    print("\nSamples by Purpose:")
    for purpose, data in stats['by_purpose'].items():
        if data['count'] > 0:
            print(f"  {purpose}: {data['count']} samples (avg_score: {data['avg_score']:.3f})")
    
    # Create training JSONL files
    train_samples = []
    valid_samples = []
    
    # Process all samples
    all_samples = []
    for purpose in ['reasoning', 'action']:
        for sample in builder.datasets[purpose].samples:
            messages = sample.to_messages()
            all_samples.append({
                "messages": messages,
                "purpose": purpose,
                "score": sample.get_weighted_score(),
            })
    
    # Shuffle and split (90/10)
    import random
    random.shuffle(all_samples)
    split_idx = int(len(all_samples) * 0.9)
    train_samples = all_samples[:split_idx]
    valid_samples = all_samples[split_idx:]
    
    # Write files
    train_path = os.path.join(output_dir, "train.jsonl")
    valid_path = os.path.join(output_dir, "valid.jsonl")
    
    with open(train_path, 'w') as f:
        for sample in train_samples:
            f.write(json.dumps({"messages": sample["messages"]}) + "\n")
    
    with open(valid_path, 'w') as f:
        for sample in valid_samples:
            f.write(json.dumps({"messages": sample["messages"]}) + "\n")
    
    print(f"\nTraining files created:")
    print(f"  Train: {train_path} ({len(train_samples)} samples)")
    print(f"  Valid: {valid_path} ({len(valid_samples)} samples)")
    
    # Show sample
    if train_samples:
        print("\nSample Training Entry:")
        print("-" * 60)
        sample = train_samples[0]
        for msg in sample["messages"]:
            role = msg["role"].upper()
            content = msg["content"][:200] + "..." if len(msg["content"]) > 200 else msg["content"]
            print(f"[{role}]: {content}")
        print("-" * 60)
    
    return train_path, valid_path, len(train_samples), len(valid_samples)


# ============================================================
# STEP 4: LOCAL TRAINING WITH MLX
# ============================================================

def train_with_mlx(
    model_name: str,
    data_dir: str,
    output_dir: str,
    num_iters: int = 50,
    batch_size: int = 2,
    learning_rate: float = 1e-5,
):
    """
    Train using MLX LoRA on Apple Silicon via CLI.
    """
    print_section("STEP 4: LOCAL TRAINING WITH MLX")
    
    print(f"Model: {model_name}")
    print(f"Data directory: {data_dir}")
    print(f"Output: {output_dir}")
    print(f"Iterations: {num_iters}")
    print(f"Batch size: {batch_size}")
    print(f"Learning rate: {learning_rate}")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Build command
    import subprocess
    
    cmd = [
        sys.executable, "-m", "mlx_lm", "lora",
        "--model", model_name,
        "--train",
        "--data", data_dir,
        "--adapter-path", output_dir,
        "--batch-size", str(batch_size),
        "--iters", str(num_iters),
        "--learning-rate", str(learning_rate),
        "--steps-per-report", "5",
        "--steps-per-eval", "10",
        "--val-batches", "5",
        "--max-seq-length", "2048",
        "--num-layers", "8",
        "--mask-prompt",
    ]
    
    print("\nRunning MLX LoRA training...")
    print(f"Command: {' '.join(cmd)}")
    print("-" * 60)
    
    try:
        result = subprocess.run(
            cmd,
            check=True,
            text=True,
        )
        
        print("-" * 60)
        print("\n✅ Training completed successfully!")
        print(f"   Adapter saved to: {output_dir}")
        
        return output_dir
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Training failed with return code {e.returncode}")
        return None
    except Exception as e:
        logger.error(f"Training failed: {e}")
        import traceback
        traceback.print_exc()
        return None


# ============================================================
# STEP 5: VALIDATE TRAINED MODEL
# ============================================================

def validate_trained_model(model_name: str, adapter_path: str):
    """
    Test the trained model to verify it works.
    """
    print_section("STEP 5: VALIDATE TRAINED MODEL")
    
    try:
        from mlx_lm import load, generate
    except ImportError:
        logger.error("MLX not available")
        return False
    
    print(f"Loading model with adapter...")
    print(f"  Base model: {model_name}")
    print(f"  Adapter: {adapter_path}")
    
    try:
        model, tokenizer = load(model_name, adapter_path=adapter_path)
        print("  ✅ Model loaded successfully with adapter")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False
    
    # Test generation
    print("\nTest Generation:")
    print("-" * 60)
    
    test_prompt = """You are a trading agent in Babylon prediction markets.

Current State:
- Balance: $10,000
- P&L: $0
- Positions: 0

Market Update:
- BTC prediction market at 65% probability
- News: Fed signals rate cuts

Analyze this market update and explain your trading decision."""
    
    print(f"Prompt: {test_prompt[:100]}...")
    print()
    
    try:
        # Format as chat messages
        messages = [{"role": "user", "content": test_prompt}]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        response = generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=200,
            verbose=False,
        )
        
        print("Response:")
        print(response)
        print("-" * 60)
        print("\n✅ Model generates valid output!")
        return True
        
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        return False


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Babylon Local Training with MLX",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    parser.add_argument(
        "--model",
        default="mlx-community/Qwen2.5-3B-Instruct-4bit",
        help="MLX model to train"
    )
    parser.add_argument(
        "--trajectories",
        type=int,
        default=10,
        help="Number of trajectories to generate"
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=15,
        help="Steps per trajectory"
    )
    parser.add_argument(
        "--iters",
        type=int,
        default=50,
        help="Training iterations"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2,
        help="Batch size"
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=1e-5,
        help="Learning rate"
    )
    parser.add_argument(
        "--output",
        default="./trained_adapters",
        help="Output directory for trained adapter"
    )
    parser.add_argument(
        "--skip-training",
        action="store_true",
        help="Skip training, only generate and validate data"
    )
    
    args = parser.parse_args()
    
    print("\n" + "=" * 70)
    print("  BABYLON LOCAL TRAINING PIPELINE")
    print("=" * 70)
    print(f"  Model: {args.model}")
    print(f"  Trajectories: {args.trajectories}")
    print(f"  Steps/Trajectory: {args.steps}")
    print(f"  Training Iterations: {args.iters}")
    print(f"  Batch Size: {args.batch_size}")
    print(f"  Learning Rate: {args.lr}")
    print(f"  Output: {args.output}")
    print("=" * 70)
    
    # Create directory for training data
    if args.skip_training:
        data_dir = tempfile.mkdtemp(prefix="babylon_training_")
    else:
        data_dir = os.path.join(args.output, "training_data")
        os.makedirs(data_dir, exist_ok=True)
    print(f"\nTraining data directory: {data_dir}")
    
    try:
        # Step 1: Generate data
        trajectories, quality_scores = generate_training_data(
            num_trajectories=args.trajectories,
            steps_per_trajectory=args.steps,
        )
        
        # Step 2: Validate data
        data_valid = validate_data_completeness(trajectories, quality_scores)
        if not data_valid:
            logger.error("Data validation failed!")
            return 1
        
        # Step 3: Prepare training format
        train_path, valid_path, train_count, valid_count = prepare_training_data(
            trajectories,
            quality_scores,
            data_dir,
        )
        
        if args.skip_training:
            print("\n" + "=" * 70)
            print("  SKIPPING TRAINING (--skip-training flag)")
            print("=" * 70)
            print(f"\nData prepared at: {data_dir}")
            print("To train manually, run:")
            print(f"  python -m mlx_lm lora --model {args.model} --train --data {data_dir}")
            return 0
        
        # Step 4: Train
        adapter_path = train_with_mlx(
            model_name=args.model,
            data_dir=data_dir,
            output_dir=args.output,
            num_iters=args.iters,
            batch_size=args.batch_size,
            learning_rate=args.lr,
        )
        
        if not adapter_path:
            logger.error("Training failed!")
            return 1
        
        # Step 5: Validate trained model
        model_valid = validate_trained_model(args.model, adapter_path)
        
        print("\n" + "=" * 70)
        print("  TRAINING COMPLETE")
        print("=" * 70)
        print(f"  Trained adapter: {adapter_path}")
        print(f"  Data validation: {'✅ PASSED' if data_valid else '❌ FAILED'}")
        print(f"  Model validation: {'✅ PASSED' if model_valid else '❌ FAILED'}")
        print("=" * 70 + "\n")
        
        return 0 if (data_valid and model_valid) else 1
        
    finally:
        # Only cleanup temp directories (when skip-training is used)
        if args.skip_training and os.path.exists(data_dir) and data_dir.startswith(tempfile.gettempdir()):
            import shutil
            print(f"\nCleaning up temp directory: {data_dir}")
            shutil.rmtree(data_dir)


if __name__ == "__main__":
    sys.exit(main())

