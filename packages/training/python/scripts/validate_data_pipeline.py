#!/usr/bin/env python3
"""
Data Pipeline Validation Script

Validates the entire training data pipeline:
1. ETL: Trajectory extraction and transformation
2. Context Prep: Prompt formatting and preservation
3. Judging: Score attribution and variance
4. Input/Output Pairs: Proper format for all prompt types

Run this before training to verify data quality.
"""

import asyncio
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models import (
    LLMCall,
    Action,
    EnvironmentState,
    BabylonTrajectory,
    TrajectoryStep,
)
from src.training.multi_prompt_dataset import (
    MultiPromptDatasetBuilder,
    PromptSample,
)
from src.training.quality_utils import (
    calculate_trajectory_quality_score,
    build_trajectory_from_ticks,
)
from src.training.rollout_generator import AgentTickData
from src.data_bridge.converter import BabylonToAtroposConverter


# =============================================================================
# TEST DATA GENERATION
# =============================================================================


def generate_test_trajectory(
    agent_id: str,
    archetype: str = "trader",
    num_steps: int = 10,
) -> tuple[BabylonTrajectory, list[AgentTickData]]:
    """Generate a realistic test trajectory with multiple LLM calls per step."""
    
    steps = []
    tick_data_list = []
    
    for step_num in range(num_steps):
        llm_calls = []
        
        # 1. Reasoning call
        reasoning_response = f"""Market Analysis Step {step_num}:
1. Current portfolio value: ${10000 + step_num * 50:.2f}
2. Market trend: {'bullish' if random.random() > 0.4 else 'bearish'}
3. Key insight: Momentum indicators suggest {'buying' if random.random() > 0.5 else 'selling'} opportunity
4. Risk assessment: {'Low' if random.random() > 0.6 else 'Medium'} risk level

Conclusion: {'Proceed with trade' if random.random() > 0.4 else 'Wait for better entry'}"""

        reasoning_call = LLMCall(
            model="qwen3-32b",
            system_prompt=f"You are a {archetype} agent. Analyze markets carefully.",
            user_prompt=f"Step {step_num}: Analyze the current market. Balance: ${10000 + step_num * 50:.2f}",
            response=reasoning_response,
            purpose="reasoning",
            temperature=0.7,
            max_tokens=1024,
        )
        llm_calls.append(reasoning_call)
        
        # 2. Action call
        action_type = random.choice(["buy", "sell", "wait"])
        if action_type != "wait":
            action_response = f'{{"action": "{action_type}", "market": "AAPL", "amount": {random.randint(10, 100)}, "reasoning": "Following momentum signal"}}'
        else:
            action_response = '{"action": "wait", "reasoning": "No clear signal"}'
            
        action_call = LLMCall(
            model="qwen3-32b",
            system_prompt=f"You are a {archetype} agent. Execute trades.",
            user_prompt=f"Based on analysis, decide action. Previous: {action_type}",
            response=action_response,
            purpose="action",
            temperature=0.7,
            max_tokens=512,
        )
        llm_calls.append(action_call)
        
        # 3. Evaluation call (50% of the time)
        if random.random() > 0.5:
            eval_response = f'{{"confidence": {random.uniform(0.5, 0.95):.2f}, "risk_score": {random.uniform(0.1, 0.8):.2f}}}'
            eval_call = LLMCall(
                model="qwen3-32b",
                system_prompt="Evaluate the decision quality.",
                user_prompt=f"Evaluate action: {action_type}",
                response=eval_response,
                purpose="evaluation",
                temperature=0.3,
                max_tokens=256,
            )
            llm_calls.append(eval_call)
        
        # 4. Response call (for social interactions, 30% of the time)
        if random.random() > 0.7:
            response_call = LLMCall(
                model="qwen3-32b",
                system_prompt="You are engaging with the community.",
                user_prompt="User asked: What do you think about AAPL?",
                response="I'm bullish on AAPL. The fundamentals look strong and momentum is building.",
                purpose="response",
                temperature=0.8,
                max_tokens=512,
            )
            llm_calls.append(response_call)
        
        # Build environment state
        env_state = EnvironmentState(
            agent_balance=10000 + step_num * 50,
            agent_pnl=step_num * 50,
            open_positions=random.randint(0, 5),
        )
        
        # Build action
        success = random.random() > 0.3
        action = Action(
            action_type=action_type,
            parameters={"amount": random.randint(10, 100), "market": "AAPL"},
            success=success,
            reasoning="Following momentum signal",
        )
        
        # Build step
        step = TrajectoryStep(
            step_number=step_num,
            timestamp=int(datetime.now().timestamp() * 1000) + step_num * 1000,
            environment_state=env_state,
            llm_calls=llm_calls,
            action=action,
            reward=0.5 if success else -0.3,
        )
        steps.append(step)
        
        # Build tick data for quality scoring
        tick_data = AgentTickData(
            tick_number=step_num,
            timestamp=step.timestamp,
            observation={"tick": step_num},
            environment_state=env_state,
            llm_calls=llm_calls,
            action=action,
            feedback={"success": success},
            reward=step.reward,
        )
        tick_data_list.append(tick_data)
    
    # Build trajectory
    trajectory = BabylonTrajectory(
        trajectory_id=f"traj-{agent_id}-{int(datetime.now().timestamp())}",
        agent_id=agent_id,
        window_id="test-window",
        steps=steps,
        final_pnl=sum(s.reward for s in steps) * 100,
        trades_executed=sum(1 for s in steps if s.action and s.action.action_type != "wait"),
        episode_length=num_steps,
    )
    
    return trajectory, tick_data_list


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================


def validate_etl(trajectories: list[BabylonTrajectory]) -> dict:
    """Validate ETL pipeline."""
    print("\n" + "=" * 70)
    print("  ETL VALIDATION")
    print("=" * 70)
    
    issues = []
    stats = {
        "trajectories": len(trajectories),
        "total_steps": 0,
        "total_llm_calls": 0,
        "calls_by_purpose": {"reasoning": 0, "action": 0, "evaluation": 0, "response": 0, "other": 0},
    }
    
    for traj in trajectories:
        stats["total_steps"] += len(traj.steps)
        
        for step in traj.steps:
            if not step.llm_calls:
                issues.append(f"Step {step.step_number} in {traj.trajectory_id}: No LLM calls")
            
            for call in step.llm_calls:
                stats["total_llm_calls"] += 1
                purpose = call.purpose or "other"
                stats["calls_by_purpose"][purpose] = stats["calls_by_purpose"].get(purpose, 0) + 1
                
                # Validate call
                if not call.user_prompt:
                    issues.append(f"LLM call missing user_prompt")
                if not call.response:
                    issues.append(f"LLM call missing response")
                if len(call.response or "") < 10:
                    issues.append(f"LLM call response too short: {len(call.response or '')}")
    
    # Print stats
    print(f"\nTrajectories: {stats['trajectories']}")
    print(f"Total Steps: {stats['total_steps']}")
    print(f"Total LLM Calls: {stats['total_llm_calls']}")
    print(f"Avg Calls/Step: {stats['total_llm_calls'] / max(1, stats['total_steps']):.2f}")
    print(f"\nCalls by Purpose:")
    for purpose, count in stats["calls_by_purpose"].items():
        pct = count / max(1, stats["total_llm_calls"]) * 100
        print(f"  {purpose:<12}: {count:>4} ({pct:.1f}%)")
    
    # Print issues
    if issues:
        print(f"\n⚠️  {len(issues)} Issues Found:")
        for issue in issues[:10]:
            print(f"  - {issue}")
        if len(issues) > 10:
            print(f"  ... and {len(issues) - 10} more")
    else:
        print("\n✅ No ETL issues found")
    
    return {"stats": stats, "issues": issues}


def validate_context_prep(builder: MultiPromptDatasetBuilder) -> dict:
    """Validate context preparation."""
    print("\n" + "=" * 70)
    print("  CONTEXT PREPARATION VALIDATION")
    print("=" * 70)
    
    issues = []
    sample_count = 0
    
    for purpose, dataset in builder.datasets.items():
        print(f"\n{purpose.upper()} samples ({len(dataset.samples)}):")
        
        for sample in dataset.samples[:3]:  # Show first 3
            sample_count += 1
            
            # Validate sample structure
            if not sample.system_prompt:
                issues.append(f"Sample {sample_count}: Missing system_prompt")
            if not sample.user_prompt:
                issues.append(f"Sample {sample_count}: Missing user_prompt")
            if not sample.response:
                issues.append(f"Sample {sample_count}: Missing response")
            
            # Show sample preview
            print(f"\n  Sample {sample.step_number}.{sample.call_index}:")
            print(f"    System: {sample.system_prompt[:50]}...")
            print(f"    User: {sample.user_prompt[:50]}...")
            print(f"    Response: {sample.response[:50]}...")
            print(f"    Score: {sample.get_weighted_score():.3f}")
    
    if issues:
        print(f"\n⚠️  {len(issues)} Issues Found:")
        for issue in issues[:10]:
            print(f"  - {issue}")
    else:
        print("\n✅ Context prep looks good")
    
    return {"issues": issues}


def validate_judging(builder: MultiPromptDatasetBuilder) -> dict:
    """Validate judging/scoring."""
    print("\n" + "=" * 70)
    print("  JUDGING/SCORING VALIDATION")
    print("=" * 70)
    
    issues = []
    
    for purpose, dataset in builder.datasets.items():
        if not dataset.samples:
            continue
        
        scores = [s.get_weighted_score() for s in dataset.samples]
        
        avg = sum(scores) / len(scores)
        variance = sum((s - avg) ** 2 for s in scores) / len(scores)
        min_score = min(scores)
        max_score = max(scores)
        
        print(f"\n{purpose.upper()}:")
        print(f"  Samples: {len(scores)}")
        print(f"  Score Range: {min_score:.3f} - {max_score:.3f}")
        print(f"  Mean: {avg:.3f}")
        print(f"  Variance: {variance:.4f}")
        
        # Check for GRPO requirements
        if variance < 0.001:
            issues.append(f"{purpose}: Score variance too low ({variance:.4f}) for effective GRPO")
        
        if len(scores) < 4:
            issues.append(f"{purpose}: Too few samples ({len(scores)}) for GRPO groups")
        
        # Check diversity
        diversity = dataset.get_diversity_metrics()
        is_diverse, div_issues = dataset.is_diverse_enough()
        
        print(f"  Unique trajectories: {diversity.unique_trajectories}")
        print(f"  Unique action types: {diversity.unique_action_types}")
        
        if not is_diverse:
            for di in div_issues:
                issues.append(f"{purpose}: {di}")
    
    if issues:
        print(f"\n⚠️  {len(issues)} Issues Found:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("\n✅ Scoring looks good for GRPO")
    
    return {"issues": issues}


def validate_input_output_pairs(builder: MultiPromptDatasetBuilder) -> dict:
    """Validate input/output pair format."""
    print("\n" + "=" * 70)
    print("  INPUT/OUTPUT PAIR VALIDATION")
    print("=" * 70)
    
    issues = []
    
    for purpose, dataset in builder.datasets.items():
        if not dataset.samples:
            continue
        
        print(f"\n{purpose.upper()} Format Check:")
        
        for i, sample in enumerate(dataset.samples[:2]):
            messages = sample.to_messages()
            
            print(f"\n  Sample {i+1} message structure:")
            for msg in messages:
                role = msg["role"]
                content_len = len(msg["content"])
                preview = msg["content"][:40].replace("\n", " ")
                print(f"    [{role}] ({content_len} chars): {preview}...")
            
            # Validate structure
            if len(messages) != 3:
                issues.append(f"Sample should have 3 messages (system, user, assistant), got {len(messages)}")
            
            roles = [m["role"] for m in messages]
            if roles != ["system", "user", "assistant"]:
                issues.append(f"Wrong message order: {roles}")
            
            # Check for empty content
            for msg in messages:
                if not msg["content"] or len(msg["content"]) < 5:
                    issues.append(f"Empty or too short {msg['role']} content")
    
    print("\n\nExpected Format for GRPO Training:")
    print("""
    {
        "messages": [
            {"role": "system", "content": "<agent system prompt>"},
            {"role": "user", "content": "<market context + instructions>"},
            {"role": "assistant", "content": "<model output to train>"}
        ],
        "score": <float>,  # For advantage calculation
    }
    """)
    
    if issues:
        print(f"\n⚠️  {len(issues)} Issues Found:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("\n✅ Input/output format is correct")
    
    return {"issues": issues}


def validate_converter_masking():
    """Validate the converter mask generation."""
    print("\n" + "=" * 70)
    print("  CONVERTER MASK VALIDATION")
    print("=" * 70)
    
    issues = []
    
    # Create test trajectory
    traj, _ = generate_test_trajectory("test-agent", "trader", 3)
    
    # Convert without tokenizer (just check messages)
    converter = BabylonToAtroposConverter()
    result = converter.convert_trajectory(traj)
    
    print(f"\nConverted trajectory:")
    print(f"  Messages: {len(result.messages)}")
    print(f"  Token count: {len(result.tokens)} (no tokenizer)")
    
    # Count assistant messages
    assistant_count = sum(1 for m in result.messages if m.role == "assistant")
    user_count = sum(1 for m in result.messages if m.role == "user")
    
    print(f"  User messages: {user_count}")
    print(f"  Assistant messages: {assistant_count}")
    
    # Verify all LLM calls are captured
    total_llm_calls = sum(len(s.llm_calls) for s in traj.steps)
    if assistant_count < total_llm_calls:
        issues.append(f"Lost LLM calls: {total_llm_calls} calls but only {assistant_count} assistant messages")
    else:
        print(f"\n✅ All {total_llm_calls} LLM calls captured in converter")
    
    # Show message preview
    print("\n  Message Preview:")
    for i, msg in enumerate(result.messages[:6]):
        preview = msg.content[:40].replace("\n", " ")
        print(f"    {i+1}. [{msg.role}]: {preview}...")
    
    if len(result.messages) > 6:
        print(f"    ... and {len(result.messages) - 6} more messages")
    
    if issues:
        print(f"\n⚠️  {len(issues)} Issues Found:")
        for issue in issues:
            print(f"  - {issue}")
    
    return {"issues": issues}


# =============================================================================
# MAIN
# =============================================================================


def main():
    print("=" * 70)
    print("  DATA PIPELINE VALIDATION")
    print("=" * 70)
    
    # Generate test data
    print("\nGenerating test trajectories...")
    
    archetypes = ["trader", "degen", "researcher", "social-butterfly"]
    trajectories = []
    all_tick_data = []
    
    for arch in archetypes:
        traj, ticks = generate_test_trajectory(f"agent-{arch}", arch, num_steps=10)
        trajectories.append(traj)
        all_tick_data.append(ticks)
    
    print(f"Generated {len(trajectories)} trajectories")
    
    # Build multi-prompt dataset
    builder = MultiPromptDatasetBuilder()
    
    for traj, ticks in zip(trajectories, all_tick_data):
        quality = calculate_trajectory_quality_score(ticks, archetype=traj.agent_id.split("-")[-1])
        builder.add_trajectory(traj, quality)
    
    # Run all validations
    all_issues = []
    
    etl_result = validate_etl(trajectories)
    all_issues.extend(etl_result["issues"])
    
    context_result = validate_context_prep(builder)
    all_issues.extend(context_result["issues"])
    
    judge_result = validate_judging(builder)
    all_issues.extend(judge_result["issues"])
    
    io_result = validate_input_output_pairs(builder)
    all_issues.extend(io_result["issues"])
    
    converter_result = validate_converter_masking()
    all_issues.extend(converter_result["issues"])
    
    # Final summary
    print("\n" + "=" * 70)
    print("  FINAL SUMMARY")
    print("=" * 70)
    
    stats = builder.get_statistics()
    print(f"\nDataset Statistics:")
    print(f"  Total Trajectories: {stats['total_trajectories']}")
    print(f"  Total Steps: {stats['total_steps']}")
    print(f"  Total Samples: {stats['total_samples']}")
    
    print(f"\n  By Purpose:")
    for purpose, pstats in stats["by_purpose"].items():
        print(f"    {purpose}: {pstats['count']} samples, avg_score={pstats['avg_score']:.3f}")
    
    if all_issues:
        print(f"\n🔴 TOTAL ISSUES: {len(all_issues)}")
        print("   Review issues above and fix before training.")
    else:
        print("\n✅ ALL VALIDATIONS PASSED")
        print("   Data pipeline is ready for training.")
    
    return len(all_issues) == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

