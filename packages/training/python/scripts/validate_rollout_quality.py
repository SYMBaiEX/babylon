#!/usr/bin/env python3
"""
Rollout Quality Validation

Validates that rollouts meet quality standards for RL training:
1. Complete agent tick capture (observation → thinking → action → feedback)
2. LLM calls have full prompts and responses
3. Actions are properly recorded with outcomes
4. Environment state is tracked correctly
5. Rewards are meaningful

Usage:
    python scripts/validate_rollout_quality.py
    python scripts/validate_rollout_quality.py --window-id "2024-01-01T00:00"
    python scripts/validate_rollout_quality.py --sample 100
"""

import asyncio
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
import asyncpg

from src.models import BabylonTrajectory, TrajectoryStep

# Load environment
load_dotenv()

# Colors for output
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

def print_header(msg):
    print(f"\n{BLUE}{'=' * 60}")
    print(f"  {msg}")
    print(f"{'=' * 60}{RESET}\n")


@dataclass
class QualityMetrics:
    """Quality metrics for a set of rollouts"""
    
    total_trajectories: int = 0
    total_steps: int = 0
    total_llm_calls: int = 0
    total_actions: int = 0
    
    # Completeness metrics
    steps_with_llm_calls: int = 0
    steps_with_reasoning: int = 0
    steps_with_actions: int = 0
    steps_with_rewards: int = 0
    
    # Quality issues
    empty_prompts: int = 0
    empty_responses: int = 0
    truncated_reasoning: int = 0
    missing_env_state: int = 0
    null_values: int = 0
    
    # Content metrics
    avg_prompt_length: float = 0.0
    avg_response_length: float = 0.0
    avg_reasoning_length: float = 0.0
    avg_llm_calls_per_step: float = 0.0
    
    # Score metrics
    score_variance: float = 0.0
    score_min: float = 0.0
    score_max: float = 0.0
    
    def is_quality_acceptable(self) -> bool:
        """Check if overall quality is acceptable for training"""
        if self.total_steps == 0:
            return False
        
        # Must have LLM calls in at least 80% of steps
        llm_coverage = self.steps_with_llm_calls / self.total_steps
        if llm_coverage < 0.8:
            return False
        
        # Must have low error rate
        error_rate = (self.empty_prompts + self.empty_responses) / max(self.total_llm_calls, 1)
        if error_rate > 0.1:
            return False
        
        return True
    
    def get_quality_score(self) -> float:
        """Calculate overall quality score (0-1)"""
        if self.total_steps == 0:
            return 0.0
        
        scores = []
        
        # LLM call coverage (weight: 0.3)
        llm_coverage = self.steps_with_llm_calls / self.total_steps
        scores.append(llm_coverage * 0.3)
        
        # Reasoning coverage (weight: 0.2)
        reasoning_coverage = self.steps_with_reasoning / self.total_steps
        scores.append(reasoning_coverage * 0.2)
        
        # Content quality (weight: 0.2)
        if self.total_llm_calls > 0:
            error_rate = (self.empty_prompts + self.empty_responses) / self.total_llm_calls
            content_quality = 1.0 - error_rate
        else:
            content_quality = 0.0
        scores.append(content_quality * 0.2)
        
        # Response length (weight: 0.15)
        # Good responses should be >100 chars on average
        length_score = min(self.avg_response_length / 200.0, 1.0)
        scores.append(length_score * 0.15)
        
        # Reward coverage (weight: 0.15)
        reward_coverage = self.steps_with_rewards / self.total_steps
        scores.append(reward_coverage * 0.15)
        
        return sum(scores)


class RolloutQualityValidator:
    """Validates rollout quality for training"""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool: asyncpg.Pool | None = None
        self.metrics = QualityMetrics()
        self.issues: list[str] = []
    
    async def connect(self):
        """Connect to database"""
        self.pool = await asyncpg.create_pool(
            self.database_url,
            min_size=2,
            max_size=5,
            command_timeout=60
        )
    
    async def close(self):
        """Close database connection"""
        if self.pool:
            await self.pool.close()
    
    async def validate_recent_trajectories(
        self,
        lookback_hours: int = 24,
        sample_size: int = 100,
    ) -> QualityMetrics:
        """Validate recent trajectories"""
        print_header("VALIDATING RECENT TRAJECTORIES")
        print_info(f"Lookback: {lookback_hours} hours")
        print_info(f"Sample size: {sample_size}")
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT 
                    "trajectoryId",
                    "agentId",
                    "windowId",
                    "stepsJson",
                    "totalReward",
                    "finalPnL",
                    "episodeLength",
                    "aiJudgeReward"
                FROM trajectories
                WHERE 
                    "createdAt" > NOW() - $1::interval
                    AND "isTrainingData" = true
                    AND "stepsJson" IS NOT NULL
                ORDER BY RANDOM()
                LIMIT $2
            """, f"{lookback_hours} hours", sample_size)
        
        print_info(f"Found {len(rows)} trajectories to validate")
        
        for row in rows:
            await self._validate_trajectory(row)
        
        self._calculate_aggregate_metrics()
        
        return self.metrics
    
    async def validate_window(self, window_id: str) -> QualityMetrics:
        """Validate all trajectories in a specific window"""
        print_header(f"VALIDATING WINDOW: {window_id}")
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT 
                    "trajectoryId",
                    "agentId",
                    "windowId",
                    "stepsJson",
                    "totalReward",
                    "finalPnL",
                    "episodeLength",
                    "aiJudgeReward"
                FROM trajectories
                WHERE "windowId" = $1
                AND "stepsJson" IS NOT NULL
            """, window_id)
        
        print_info(f"Found {len(rows)} trajectories in window")
        
        for row in rows:
            await self._validate_trajectory(row)
        
        self._calculate_aggregate_metrics()
        
        return self.metrics
    
    async def _validate_trajectory(self, row: dict):
        """Validate a single trajectory"""
        trajectory_id = row['trajectoryId']
        
        # Parse steps
        steps_json = row['stepsJson']
        if not steps_json or steps_json in ['null', '[]']:
            self.issues.append(f"Trajectory {trajectory_id[:8]}: Empty stepsJson")
            self.metrics.null_values += 1
            return
        
        try:
            steps = json.loads(steps_json)
        except json.JSONDecodeError:
            self.issues.append(f"Trajectory {trajectory_id[:8]}: Invalid JSON")
            self.metrics.null_values += 1
            return
        
        if not isinstance(steps, list) or len(steps) == 0:
            self.issues.append(f"Trajectory {trajectory_id[:8]}: Empty steps array")
            self.metrics.null_values += 1
            return
        
        self.metrics.total_trajectories += 1
        self.metrics.total_steps += len(steps)
        
        # Validate each step
        prompt_lengths = []
        response_lengths = []
        reasoning_lengths = []
        
        for step_idx, step in enumerate(steps):
            if not isinstance(step, dict):
                self.issues.append(f"Trajectory {trajectory_id[:8]}, step {step_idx}: Not a dict")
                continue
            
            # Check environment state
            env_state = step.get('environmentState', step.get('environment_state'))
            if not env_state:
                self.metrics.missing_env_state += 1
            
            # Check LLM calls
            llm_calls = step.get('llmCalls', step.get('llm_calls', []))
            
            if llm_calls:
                self.metrics.steps_with_llm_calls += 1
                self.metrics.total_llm_calls += len(llm_calls)
                
                for call in llm_calls:
                    # Check prompt
                    user_prompt = call.get('userPrompt', call.get('user_prompt', ''))
                    if not user_prompt or len(user_prompt) < 10:
                        self.metrics.empty_prompts += 1
                    else:
                        prompt_lengths.append(len(user_prompt))
                    
                    # Check response
                    response = call.get('response', '')
                    if not response or len(response) < 10:
                        self.metrics.empty_responses += 1
                    else:
                        response_lengths.append(len(response))
                    
                    # Check reasoning
                    reasoning = call.get('reasoning', '')
                    if reasoning:
                        reasoning_lengths.append(len(reasoning))
                        self.metrics.steps_with_reasoning += 1
                        
                        # Check for truncation (ends with "...")
                        if reasoning.endswith('...') or len(reasoning) == 200:
                            self.metrics.truncated_reasoning += 1
            
            # Check action
            action = step.get('action')
            if action:
                self.metrics.steps_with_actions += 1
                self.metrics.total_actions += 1
                
                # Check action reasoning
                action_reasoning = action.get('reasoning', '')
                if action_reasoning:
                    reasoning_lengths.append(len(action_reasoning))
            
            # Check reward
            reward = step.get('reward', 0)
            if reward != 0:
                self.metrics.steps_with_rewards += 1
        
        # Update aggregate metrics
        if prompt_lengths:
            self.metrics.avg_prompt_length = (
                self.metrics.avg_prompt_length * (self.metrics.total_trajectories - 1) +
                sum(prompt_lengths) / len(prompt_lengths)
            ) / self.metrics.total_trajectories
        
        if response_lengths:
            self.metrics.avg_response_length = (
                self.metrics.avg_response_length * (self.metrics.total_trajectories - 1) +
                sum(response_lengths) / len(response_lengths)
            ) / self.metrics.total_trajectories
        
        if reasoning_lengths:
            self.metrics.avg_reasoning_length = (
                self.metrics.avg_reasoning_length * (self.metrics.total_trajectories - 1) +
                sum(reasoning_lengths) / len(reasoning_lengths)
            ) / self.metrics.total_trajectories
    
    def _calculate_aggregate_metrics(self):
        """Calculate aggregate metrics"""
        if self.metrics.total_steps > 0:
            self.metrics.avg_llm_calls_per_step = (
                self.metrics.total_llm_calls / self.metrics.total_steps
            )
    
    def print_report(self):
        """Print quality report"""
        m = self.metrics
        
        print_header("ROLLOUT QUALITY REPORT")
        
        # Summary
        print("📊 SUMMARY")
        print(f"   Total trajectories: {m.total_trajectories}")
        print(f"   Total steps: {m.total_steps}")
        print(f"   Total LLM calls: {m.total_llm_calls}")
        print(f"   Total actions: {m.total_actions}")
        
        # Coverage metrics
        print("\n📈 COVERAGE")
        if m.total_steps > 0:
            llm_coverage = m.steps_with_llm_calls / m.total_steps * 100
            reasoning_coverage = m.steps_with_reasoning / m.total_steps * 100
            action_coverage = m.steps_with_actions / m.total_steps * 100
            reward_coverage = m.steps_with_rewards / m.total_steps * 100
            
            if llm_coverage >= 80:
                print_success(f"   LLM calls per step: {m.avg_llm_calls_per_step:.2f} ({llm_coverage:.1f}% coverage)")
            else:
                print_warning(f"   LLM calls per step: {m.avg_llm_calls_per_step:.2f} ({llm_coverage:.1f}% coverage)")
            
            if reasoning_coverage >= 50:
                print_success(f"   Steps with reasoning: {reasoning_coverage:.1f}%")
            else:
                print_warning(f"   Steps with reasoning: {reasoning_coverage:.1f}%")
            
            print_info(f"   Steps with actions: {action_coverage:.1f}%")
            print_info(f"   Steps with rewards: {reward_coverage:.1f}%")
        
        # Content quality
        print("\n📝 CONTENT QUALITY")
        print_info(f"   Avg prompt length: {m.avg_prompt_length:.0f} chars")
        print_info(f"   Avg response length: {m.avg_response_length:.0f} chars")
        print_info(f"   Avg reasoning length: {m.avg_reasoning_length:.0f} chars")
        
        # Issues
        print("\n⚠️  ISSUES")
        if m.empty_prompts > 0:
            print_warning(f"   Empty prompts: {m.empty_prompts}")
        if m.empty_responses > 0:
            print_warning(f"   Empty responses: {m.empty_responses}")
        if m.truncated_reasoning > 0:
            print_warning(f"   Truncated reasoning: {m.truncated_reasoning}")
        if m.missing_env_state > 0:
            print_warning(f"   Missing env state: {m.missing_env_state}")
        if m.null_values > 0:
            print_error(f"   Null/invalid values: {m.null_values}")
        
        if not any([m.empty_prompts, m.empty_responses, m.truncated_reasoning, m.missing_env_state, m.null_values]):
            print_success("   No issues found!")
        
        # Quality score
        quality_score = m.get_quality_score()
        print("\n🎯 QUALITY SCORE")
        if quality_score >= 0.8:
            print_success(f"   Score: {quality_score:.2f}/1.00 - EXCELLENT")
        elif quality_score >= 0.6:
            print_info(f"   Score: {quality_score:.2f}/1.00 - GOOD")
        elif quality_score >= 0.4:
            print_warning(f"   Score: {quality_score:.2f}/1.00 - FAIR")
        else:
            print_error(f"   Score: {quality_score:.2f}/1.00 - POOR")
        
        # Training readiness
        print("\n🚀 TRAINING READINESS")
        if m.is_quality_acceptable():
            print_success("   Data quality is acceptable for training!")
        else:
            print_error("   Data quality is NOT acceptable for training.")
            print_info("   Consider:")
            print_info("   - Increasing LLM call capture in agents")
            print_info("   - Ensuring full reasoning is saved (not truncated)")
            print_info("   - Verifying environment state is recorded")
        
        # Detailed issues (if any)
        if self.issues:
            print("\n📋 DETAILED ISSUES (first 10)")
            for issue in self.issues[:10]:
                print_warning(f"   {issue}")
            if len(self.issues) > 10:
                print_info(f"   ... and {len(self.issues) - 10} more")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Validate Rollout Quality",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    parser.add_argument(
        "--window-id",
        help="Validate specific window",
    )
    parser.add_argument(
        "--lookback",
        type=int,
        default=24,
        help="Hours to look back",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=100,
        help="Sample size",
    )
    
    args = parser.parse_args()
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print_error("DATABASE_URL not set")
        sys.exit(1)
    
    validator = RolloutQualityValidator(db_url)
    await validator.connect()
    
    try:
        if args.window_id:
            await validator.validate_window(args.window_id)
        else:
            await validator.validate_recent_trajectories(
                lookback_hours=args.lookback,
                sample_size=args.sample,
            )
        
        validator.print_report()
        
    finally:
        await validator.close()


if __name__ == "__main__":
    asyncio.run(main())

