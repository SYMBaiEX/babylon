#!/usr/bin/env python3
"""
Rollout Generation Benchmark

Benchmarks the speed and quality of rollout generation.
Generates rollouts as fast as possible and validates quality.

Usage:
    python scripts/run_rollout_benchmark.py --agents 4 --ticks 100
    python scripts/run_rollout_benchmark.py --mode benchmark --snapshot ./benchmark.json
    python scripts/run_rollout_benchmark.py --mode data --database-url postgres://...
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

from src.models import EnvironmentState, LLMCall, Action
from src.training import (
    FastSimulator,
    SimulatorConfig,
    FastRolloutGenerator,
    RolloutConfig,
    RolloutResult,
    RolloutQualityValidator,
    AgentTickData,
    MultiPromptDatasetBuilder,
    AgentRunner,
)

# Load environment
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


class MockAgent:
    """
    Mock agent for benchmarking.
    Simulates realistic agent behavior with configurable speed.
    """
    
    def __init__(
        self,
        agent_id: str,
        simulate_llm_latency: bool = False,
        llm_latency_ms: int = 50,
    ):
        self.agent_id = agent_id
        self.simulate_llm_latency = simulate_llm_latency
        self.llm_latency_ms = llm_latency_ms
        self.tick_count = 0
    
    async def run_tick(
        self,
        agent_id: str,
        observation: dict,
        env_state: EnvironmentState,
    ) -> AgentTickData:
        """Simulate an agent tick"""
        self.tick_count += 1
        
        # Simulate LLM latency if configured
        if self.simulate_llm_latency:
            await asyncio.sleep(self.llm_latency_ms / 1000)
        
        # Create mock LLM calls (reasoning + action)
        llm_calls = [
            LLMCall(
                model="qwen-2.5-3b",
                system_prompt=f"You are a trading agent in Babylon prediction markets.\nBalance: ${env_state.agent_balance:.2f}\nP&L: ${env_state.agent_pnl:.2f}",
                user_prompt=f"Tick {self.tick_count}: Analyze the market and decide on an action.\nMarkets: {len(observation.get('markets', []))}\nNews: {len(observation.get('news', []))}",
                response=f"Based on current market conditions, I observe {len(observation.get('markets', []))} active markets. My analysis suggests moderate volatility. I will look for opportunities with favorable risk/reward ratios.",
                reasoning="Considering market conditions, volatility levels, and current portfolio exposure to determine optimal action.",
                temperature=0.7,
                max_tokens=500,
                latency_ms=self.llm_latency_ms if self.simulate_llm_latency else 10,
                purpose="reasoning",
            ),
            LLMCall(
                model="qwen-2.5-3b",
                system_prompt="Select and execute a trading action.",
                user_prompt="Based on your analysis, what action do you take?",
                response=json.dumps({
                    "action": "buy_prediction",
                    "market_id": "market-1",
                    "amount": 100,
                    "outcome": "YES",
                    "reasoning": "Probability seems undervalued based on recent news."
                }),
                reasoning="Executing buy based on analysis.",
                temperature=0.3,
                max_tokens=200,
                latency_ms=self.llm_latency_ms if self.simulate_llm_latency else 10,
                purpose="action",
            ),
        ]
        
        # Create action
        action = Action(
            action_type="buy_prediction",
            parameters={
                "market_id": "market-1",
                "amount": 100,
                "outcome": "YES",
            },
            success=True,
            reasoning="Executing buy based on favorable probability assessment.",
        )
        
        return AgentTickData(
            tick_number=0,  # Will be set by simulator
            timestamp=0,  # Will be set by simulator
            observation=observation,
            environment_state=env_state,
            llm_calls=llm_calls,
            reasoning_chain="Analysis → Decision → Action",
            action=action,
            feedback={},
            reward=0.0,
        )


async def run_speed_benchmark(
    num_agents: int,
    num_ticks: int,
    simulate_llm_latency: bool,
) -> dict:
    """Run speed benchmark"""
    print("\n" + "=" * 60)
    print("  ROLLOUT GENERATION SPEED BENCHMARK")
    print("=" * 60)
    print(f"  Agents: {num_agents}")
    print(f"  Ticks: {num_ticks}")
    print(f"  Simulate LLM latency: {simulate_llm_latency}")
    print("=" * 60 + "\n")
    
    # Create mock agents
    agents = {
        f"agent-{i}": MockAgent(
            f"agent-{i}",
            simulate_llm_latency=simulate_llm_latency,
        )
        for i in range(num_agents)
    }
    
    # Create simulator
    config = SimulatorConfig(
        mode='data_generation',
        max_concurrent_agents=num_agents,
        max_ticks=num_ticks,
        save_to_db=False,
    )
    simulator = FastSimulator(config)
    
    # Run data generation
    start_time = time.time()
    
    trajectories = await simulator.generate_data(
        agent_runners=agents,  # type: ignore
        num_ticks=num_ticks,
    )
    
    duration = time.time() - start_time
    
    # Print metrics
    simulator.print_metrics()
    
    metrics = simulator.get_metrics()
    
    results = {
        "num_agents": num_agents,
        "num_ticks": num_ticks,
        "simulate_llm_latency": simulate_llm_latency,
        "duration_seconds": duration,
        "ticks_per_second": metrics.ticks_per_second,
        "avg_tick_duration_ms": metrics.avg_tick_duration_ms,
        "total_llm_calls": metrics.total_llm_calls,
        "total_actions": metrics.total_actions,
        "trajectories_generated": len(trajectories),
    }
    
    # Validate quality
    print("Validating rollout quality...")
    quality_issues = 0
    
    for traj in trajectories:
        # Check for LLM calls in each step
        for step in traj.steps:
            if not step.llm_calls:
                quality_issues += 1
    
    if quality_issues > 0:
        print(f"⚠️  Found {quality_issues} steps without LLM calls")
    else:
        print("✅ All steps have LLM calls")
    
    results["quality_issues"] = quality_issues
    
    return results


async def run_benchmark_mode(snapshot_path: str) -> dict:
    """Run benchmark mode with pre-generated snapshot"""
    print("\n" + "=" * 60)
    print("  BENCHMARK MODE")
    print("=" * 60)
    print(f"  Snapshot: {snapshot_path}")
    print("=" * 60 + "\n")
    
    # Load snapshot
    with open(snapshot_path) as f:
        snapshot = json.load(f)
    
    print(f"Loaded snapshot: {len(snapshot.get('ticks', []))} ticks")
    
    # Create simulator
    simulator = FastSimulator.for_benchmark(snapshot)
    
    # Create agents
    num_agents = 4
    agents = {
        f"agent-{i}": MockAgent(f"agent-{i}")
        for i in range(num_agents)
    }
    
    # Run benchmark
    start_time = time.time()
    
    results = await simulator.run_benchmark(
        agent_runners=agents,  # type: ignore
        progress_callback=lambda curr, total: print(f"\rProgress: {curr}/{total}", end=""),
    )
    
    print()  # Newline after progress
    
    duration = time.time() - start_time
    
    # Print metrics
    simulator.print_metrics()
    
    # Print agent results
    print("\nAgent Results:")
    for agent_id, result in results.items():
        print(f"  {agent_id}:")
        print(f"    Ticks: {result.ticks_completed}")
        print(f"    P&L: ${result.final_pnl:.2f}")
        print(f"    Quality: {result.quality_score:.2f}")
        print(f"    LLM calls: {result.total_llm_calls}")
    
    return {
        "duration_seconds": duration,
        "agents": num_agents,
        "results": {k: {
            "ticks": v.ticks_completed,
            "pnl": v.final_pnl,
            "quality": v.quality_score,
        } for k, v in results.items()},
    }


async def test_multi_prompt_dataset(num_agents: int, num_ticks: int) -> dict:
    """Test multi-prompt dataset building"""
    print("\n" + "=" * 60)
    print("  MULTI-PROMPT DATASET TEST")
    print("=" * 60 + "\n")
    
    # Generate some trajectories first
    agents = {
        f"agent-{i}": MockAgent(f"agent-{i}")
        for i in range(num_agents)
    }
    
    config = SimulatorConfig(
        mode='data_generation',
        max_ticks=num_ticks,
        save_to_db=False,
    )
    simulator = FastSimulator(config)
    
    trajectories = await simulator.generate_data(agents, num_ticks)  # type: ignore
    
    # Generate mock scores (based on P&L)
    scores = [
        0.5 + (t.final_pnl / 1000.0)  # Normalize around 0.5
        for t in trajectories
    ]
    scores = [max(0.0, min(1.0, s)) for s in scores]
    
    # Build multi-prompt dataset
    builder = MultiPromptDatasetBuilder()
    
    for traj, score in zip(trajectories, scores):
        builder.add_trajectory(traj, score)
    
    stats = builder.get_statistics()
    
    print("Dataset Statistics:")
    print(f"  Total trajectories: {stats['total_trajectories']}")
    print(f"  Total steps: {stats['total_steps']}")
    print(f"  Total samples: {stats['total_samples']}")
    print("\n  By Purpose:")
    for purpose, purpose_stats in stats['by_purpose'].items():
        print(f"    {purpose}:")
        print(f"      Count: {purpose_stats['count']}")
        print(f"      Avg score: {purpose_stats['avg_score']:.3f}")
        print(f"      Score variance: {purpose_stats['score_variance']:.4f}")
    
    # Build training groups
    training_groups = builder.build_training_data(group_size=4)
    
    print(f"\n  Training groups created: {len(training_groups)}")
    
    return {
        "statistics": stats,
        "training_groups": len(training_groups),
    }


async def main():
    parser = argparse.ArgumentParser(
        description="Rollout Generation Benchmark",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    parser.add_argument(
        "--mode",
        choices=["speed", "benchmark", "dataset"],
        default="speed",
        help="Benchmark mode",
    )
    parser.add_argument(
        "--agents",
        type=int,
        default=4,
        help="Number of agents",
    )
    parser.add_argument(
        "--ticks",
        type=int,
        default=100,
        help="Number of ticks per agent",
    )
    parser.add_argument(
        "--simulate-llm",
        action="store_true",
        help="Simulate LLM latency (50ms)",
    )
    parser.add_argument(
        "--snapshot",
        help="Path to benchmark snapshot (for benchmark mode)",
    )
    parser.add_argument(
        "--output",
        help="Output path for results JSON",
    )
    
    args = parser.parse_args()
    
    results = {}
    
    if args.mode == "speed":
        results = await run_speed_benchmark(
            num_agents=args.agents,
            num_ticks=args.ticks,
            simulate_llm_latency=args.simulate_llm,
        )
    elif args.mode == "benchmark":
        if not args.snapshot:
            print("Error: --snapshot required for benchmark mode")
            sys.exit(1)
        results = await run_benchmark_mode(args.snapshot)
    elif args.mode == "dataset":
        results = await test_multi_prompt_dataset(
            num_agents=args.agents,
            num_ticks=args.ticks,
        )
    
    # Summary
    print("\n" + "=" * 60)
    print("  BENCHMARK COMPLETE")
    print("=" * 60)
    
    if args.mode == "speed":
        print(f"  ⚡ Speed: {results.get('ticks_per_second', 0):.1f} ticks/second")
        print(f"  📊 Generated: {results.get('trajectories_generated', 0)} trajectories")
        print(f"  🧠 LLM calls: {results.get('total_llm_calls', 0)}")
    
    print("=" * 60 + "\n")
    
    # Save results if requested
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"Results saved to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())

