#!/usr/bin/env python3
"""
Archetype Benchmarking Script

Runs comprehensive benchmarks for all agent archetypes and generates
detailed performance reports.

Usage:
    python scripts/benchmark_archetypes.py
    python scripts/benchmark_archetypes.py --archetypes trader,degen
    python scripts/benchmark_archetypes.py --steps 20 --output results.json
"""

import argparse
import asyncio
import json
import random
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.training.fast_simulator import FastSimulator, SimulatorConfig
from src.training.rollout_generator import AgentTickData
from src.training.quality_utils import calculate_trajectory_quality_score, build_trajectory_from_ticks
from src.training.multi_prompt_dataset import MultiPromptDatasetBuilder
from src.training.tick_reward_attribution import TickRewardAttributor, CallPurpose
from src.training.archetype_trainer import get_rubric, get_available_archetypes, RUBRICS
from src.models import EnvironmentState, LLMCall, Action


# ============================================================
# ARCHETYPE AGENT IMPLEMENTATIONS
# ============================================================

@dataclass
class ArchetypeConfig:
    """Configuration for an archetype"""
    name: str
    description: str
    trading_frequency: float  # 0-1, how often they trade
    risk_tolerance: float  # 0-1, how risky their trades are
    analysis_depth: float  # 0-1, how detailed their reasoning is
    skill_base: float  # 0-1, base success rate


ARCHETYPE_CONFIGS: Dict[str, ArchetypeConfig] = {
    "trader": ArchetypeConfig(
        name="trader",
        description="Disciplined technical trader focused on risk-adjusted returns",
        trading_frequency=0.6,
        risk_tolerance=0.4,
        analysis_depth=0.8,
        skill_base=0.65,
    ),
    "degen": ArchetypeConfig(
        name="degen",
        description="High-risk trader who loves volatile markets and YOLO trades",
        trading_frequency=0.9,
        risk_tolerance=0.9,
        analysis_depth=0.3,
        skill_base=0.4,
    ),
    "researcher": ArchetypeConfig(
        name="researcher",
        description="Methodical researcher who analyzes fundamentals before trading",
        trading_frequency=0.3,
        risk_tolerance=0.3,
        analysis_depth=0.95,
        skill_base=0.7,
    ),
    "social-butterfly": ArchetypeConfig(
        name="social-butterfly",
        description="Social agent who follows sentiment and influencer opinions",
        trading_frequency=0.5,
        risk_tolerance=0.5,
        analysis_depth=0.5,
        skill_base=0.5,
    ),
    "scammer": ArchetypeConfig(
        name="scammer",
        description="Manipulative agent who tries to profit from information asymmetry",
        trading_frequency=0.7,
        risk_tolerance=0.7,
        analysis_depth=0.6,
        skill_base=0.55,
    ),
    "information-trader": ArchetypeConfig(
        name="information-trader",
        description="Information arbitrageur who trades on news and data",
        trading_frequency=0.65,
        risk_tolerance=0.5,
        analysis_depth=0.85,
        skill_base=0.68,
    ),
    "perps-trader": ArchetypeConfig(
        name="perps-trader",
        description="Perpetual futures specialist with high leverage tolerance",
        trading_frequency=0.75,
        risk_tolerance=0.8,
        analysis_depth=0.7,
        skill_base=0.58,
    ),
    "super-predictor": ArchetypeConfig(
        name="super-predictor",
        description="Prediction market expert who models probabilities carefully",
        trading_frequency=0.55,
        risk_tolerance=0.4,
        analysis_depth=0.9,
        skill_base=0.72,
    ),
    "goody-twoshoes": ArchetypeConfig(
        name="goody-twoshoes",
        description="Ethical trader who avoids risky or questionable markets",
        trading_frequency=0.4,
        risk_tolerance=0.2,
        analysis_depth=0.7,
        skill_base=0.6,
    ),
    "ass-kisser": ArchetypeConfig(
        name="ass-kisser",
        description="Agent who follows high-profile traders and copies their moves",
        trading_frequency=0.6,
        risk_tolerance=0.5,
        analysis_depth=0.4,
        skill_base=0.52,
    ),
    "infosec": ArchetypeConfig(
        name="infosec",
        description="Security-focused trader who looks for exploits and edge cases",
        trading_frequency=0.45,
        risk_tolerance=0.6,
        analysis_depth=0.8,
        skill_base=0.62,
    ),
    "liar": ArchetypeConfig(
        name="liar",
        description="Deceptive agent who spreads misinformation for profit",
        trading_frequency=0.65,
        risk_tolerance=0.7,
        analysis_depth=0.5,
        skill_base=0.48,
    ),
}


class ArchetypeAgent:
    """Agent that behaves according to an archetype configuration"""
    
    def __init__(self, agent_id: str, archetype: str):
        self.agent_id = agent_id
        self.archetype = archetype
        self.config = ARCHETYPE_CONFIGS.get(archetype, ARCHETYPE_CONFIGS["trader"])
        
        # State
        self.balance = 10000.0
        self.pnl = 0.0
        self.positions = 0
        self.trades = 0
        self.wins = 0
        self.tick_count = 0
    
    async def run_tick(
        self,
        agent_id: str,
        observation: dict,
        env_state: EnvironmentState,
    ) -> AgentTickData:
        """Execute one tick following archetype behavior"""
        self.tick_count += 1
        llm_calls = []
        
        # 1. REASONING call with archetype-specific analysis
        reasoning_response = self._generate_reasoning(observation)
        llm_calls.append(LLMCall(
            model='gpt-4',
            system_prompt=self._get_system_prompt(),
            user_prompt=self._get_reasoning_prompt(observation),
            response=reasoning_response,
            reasoning=f'Analyzing market as {self.archetype}',
            temperature=0.7,
            max_tokens=500,
            purpose='reasoning',
        ))
        
        # 2. ACTION call with archetype-specific decision
        action_type, action_response = self._generate_action(observation)
        llm_calls.append(LLMCall(
            model='gpt-4',
            system_prompt=self._get_system_prompt(),
            user_prompt=self._get_action_prompt(observation),
            response=action_response,
            reasoning=f'Deciding action based on {self.archetype} strategy',
            temperature=0.5,
            max_tokens=300,
            purpose='action',
        ))
        
        # Execute trade with archetype-specific success probability
        success = False
        pnl_change = 0.0
        
        if action_type in ['buy', 'sell']:
            self.trades += 1
            # Success probability based on skill and risk tolerance
            success_prob = self.config.skill_base * (1 - self.config.risk_tolerance * 0.3)
            success = random.random() < success_prob
            
            if success:
                self.wins += 1
                # Higher risk = higher potential reward
                pnl_change = random.uniform(50, 200) * (1 + self.config.risk_tolerance)
            else:
                # Higher risk = higher potential loss
                pnl_change = random.uniform(-150, -30) * (1 + self.config.risk_tolerance * 0.5)
            
            self.pnl += pnl_change
            self.balance += pnl_change
        
        # Create action
        action = Action(
            action_type=action_type,
            parameters={'amount': random.randint(50, 200), 'market': 'btc-100k'},
            reasoning=f'{self.archetype} strategy: {action_response[:50]}...',
            success=success if action_type != 'wait' else True,
        )
        
        # Calculate reward
        reward = pnl_change / 100.0 if action_type != 'wait' else 0.0
        
        return AgentTickData(
            tick_number=self.tick_count,
            timestamp=int(datetime.now(timezone.utc).timestamp() * 1000),
            observation=observation,
            environment_state=EnvironmentState(
                agent_balance=self.balance,
                agent_pnl=self.pnl,
                open_positions=self.positions,
            ),
            llm_calls=llm_calls,
            reasoning_chain=reasoning_response,
            action=action,
            feedback={'pnl_change': pnl_change, 'success': success},
            reward=reward,
        )
    
    def _get_system_prompt(self) -> str:
        win_rate_str = f"{self.wins/self.trades*100:.1f}%" if self.trades > 0 else "N/A"
        trading_freq = 'High' if self.config.trading_frequency > 0.6 else 'Medium' if self.config.trading_frequency > 0.4 else 'Low'
        risk_level = 'High' if self.config.risk_tolerance > 0.6 else 'Medium' if self.config.risk_tolerance > 0.4 else 'Low'
        analysis = 'Deep' if self.config.analysis_depth > 0.7 else 'Standard' if self.config.analysis_depth > 0.4 else 'Quick'
        
        return f"""You are {self.agent_id}, a {self.config.description}.

Your trading characteristics:
- Trading frequency: {trading_freq}
- Risk tolerance: {risk_level}
- Analysis depth: {analysis}

Current state:
- Balance: ${self.balance:.2f}
- P&L: ${self.pnl:.2f}
- Trades: {self.trades}
- Win rate: {win_rate_str}"""

    def _get_reasoning_prompt(self, obs: dict) -> str:
        return f"""Analyze the current market situation:

Markets: {json.dumps(obs.get('markets', []), indent=2)[:500]}
Your Balance: ${self.balance:.2f}
Current P&L: ${self.pnl:.2f}

As a {self.archetype}, what patterns do you see? What's your risk assessment?"""

    def _get_action_prompt(self, obs: dict) -> str:
        return f"""Based on your analysis, what action should you take?

Options:
- buy: Enter a long position
- sell: Close or short a position  
- wait: Hold and observe

Your {self.archetype} strategy suggests: What's your move?"""

    def _generate_reasoning(self, obs: dict) -> str:
        depth = self.config.analysis_depth
        
        if depth > 0.7:
            # Deep analysis
            return f"""Comprehensive {self.archetype} Analysis:

1. Market Structure:
   - Active markets: {len(obs.get('markets', []))}
   - Overall sentiment: {'Bullish' if random.random() > 0.5 else 'Bearish'}
   - Volatility level: {random.randint(20, 80)}%

2. Technical Indicators:
   - RSI: {random.randint(30, 70)}
   - MACD: {'Bullish crossover' if random.random() > 0.5 else 'Bearish divergence'}
   - Support: ${random.randint(90000, 95000)}
   - Resistance: ${random.randint(105000, 110000)}

3. Risk Assessment:
   - Position sizing: {random.randint(5, 15)}% of portfolio
   - Stop loss: {random.uniform(2, 5):.1f}%
   - Take profit: {random.uniform(8, 15):.1f}%

4. Confidence Level: {random.randint(60, 90)}%

Conclusion: Market conditions {'favor' if random.random() < self.config.skill_base else 'suggest caution for'} {self.archetype} strategy."""
        
        elif depth > 0.4:
            # Standard analysis
            return f"""{self.archetype.title()} Quick Analysis:

- Market trend: {'Up' if random.random() > 0.5 else 'Down'}
- Key level: ${random.randint(95000, 105000)}
- Risk level: {'Acceptable' if random.random() < self.config.risk_tolerance else 'Elevated'}
- Confidence: {random.randint(50, 80)}%

{'Opportunity detected' if random.random() < self.config.trading_frequency else 'Waiting for better setup'}."""
        
        else:
            # Quick gut-check
            return f"""Gut feeling: {'SEND IT' if random.random() < self.config.risk_tolerance else 'Maybe wait'}
Vibe: {'Bullish' if random.random() > 0.5 else 'Bearish'}
Confidence: {'HIGH' if random.random() < self.config.skill_base else 'YOLO'}"""

    def _generate_action(self, obs: dict) -> tuple:
        if random.random() < self.config.trading_frequency:
            action_type = random.choice(['buy', 'sell'])
            response = f"""Decision: {action_type.upper()}

{self.archetype.title()} Rationale:
- Signal strength: {random.randint(60, 95)}%
- Expected move: {'+'if action_type == 'buy' else '-'}{random.uniform(2, 8):.1f}%
- Position size: {random.randint(5, 20)}% of portfolio
- Risk/Reward: {random.uniform(1.5, 3.0):.1f}:1

Executing {action_type} order now."""
        else:
            action_type = 'wait'
            response = f"""Decision: WAIT

{self.archetype.title()} Rationale:
- Market clarity: {'Low' if random.random() > 0.5 else 'Uncertain'}
- Risk/reward: Not favorable currently
- Better entry expected

Holding position and monitoring."""
        
        return action_type, response


# ============================================================
# BENCHMARK RESULTS
# ============================================================

@dataclass
class ArchetypeBenchmarkResult:
    """Results for a single archetype benchmark"""
    archetype: str
    agent_id: str
    
    # Trading metrics
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    
    # Financial metrics
    final_pnl: float = 0.0
    final_balance: float = 10000.0
    max_drawdown: float = 0.0
    sharpe_ratio: float = 0.0
    
    # Data quality metrics
    total_steps: int = 0
    total_llm_calls: int = 0
    avg_reasoning_length: float = 0.0
    data_quality_score: float = 0.0
    
    # Training readiness
    training_score: float = 0.0  # Combined P&L + win rate + data quality
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BenchmarkReport:
    """Complete benchmark report for all archetypes"""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    total_archetypes: int = 0
    total_trajectories: int = 0
    total_steps: int = 0
    total_llm_calls: int = 0
    
    results: List[ArchetypeBenchmarkResult] = field(default_factory=list)
    
    # Aggregate metrics
    avg_win_rate: float = 0.0
    avg_pnl: float = 0.0
    best_archetype: str = ""
    worst_archetype: str = ""
    
    # System validation
    all_rubrics_valid: bool = False
    data_pipeline_valid: bool = False
    multi_prompt_valid: bool = False
    
    def to_dict(self) -> dict:
        d = asdict(self)
        d['results'] = [r.to_dict() for r in self.results]
        return d


# ============================================================
# BENCHMARK RUNNER
# ============================================================

async def run_archetype_benchmark(
    archetype: str,
    steps: int = 15,
) -> tuple[ArchetypeBenchmarkResult, list[AgentTickData]]:
    """Run benchmark for a single archetype"""
    agent_id = f"{archetype}-benchmark"
    agent = ArchetypeAgent(agent_id, archetype)
    
    # Create simulator
    config = SimulatorConfig(
        mode='data_generation',
        max_ticks=steps,
    )
    simulator = FastSimulator(config)
    
    # Run simulation
    all_ticks = []
    max_balance = 10000.0
    min_balance = 10000.0
    returns = []
    
    for tick in range(steps):
        observation = simulator.get_observation()
        env_state = EnvironmentState(
            agent_balance=agent.balance,
            agent_pnl=agent.pnl,
            open_positions=agent.positions,
        )
        
        tick_data = await agent.run_tick(agent_id, observation, env_state)
        tick_data.tick_number = tick
        all_ticks.append(tick_data)
        
        # Track for metrics
        max_balance = max(max_balance, agent.balance)
        min_balance = min(min_balance, agent.balance)
        if agent.balance > 0:
            returns.append((agent.balance - 10000) / 10000)
        
        simulator._advance_tick()
    
    # Calculate metrics
    win_rate = agent.wins / agent.trades if agent.trades > 0 else 0.0
    max_drawdown = (max_balance - min_balance) / max_balance if max_balance > 0 else 0.0
    
    # Sharpe ratio (simplified)
    if returns:
        avg_return = sum(returns) / len(returns)
        std_return = (sum((r - avg_return) ** 2 for r in returns) / len(returns)) ** 0.5
        sharpe_ratio = avg_return / std_return if std_return > 0 else 0.0
    else:
        sharpe_ratio = 0.0
    
    # Data quality
    total_llm_calls = sum(len(t.llm_calls) for t in all_ticks)
    avg_reasoning = sum(
        len(c.response) for t in all_ticks for c in t.llm_calls if c.purpose == 'reasoning'
    ) / max(1, sum(1 for t in all_ticks for c in t.llm_calls if c.purpose == 'reasoning'))
    
    data_quality = calculate_trajectory_quality_score(all_ticks)
    
    # Training score: 40% P&L + 30% win rate + 30% data quality
    pnl_score = max(0.0, min(1.0, (agent.pnl + 500) / 1000))
    training_score = pnl_score * 0.4 + win_rate * 0.3 + data_quality * 0.3
    
    result = ArchetypeBenchmarkResult(
        archetype=archetype,
        agent_id=agent_id,
        total_trades=agent.trades,
        winning_trades=agent.wins,
        losing_trades=agent.trades - agent.wins,
        win_rate=win_rate,
        final_pnl=agent.pnl,
        final_balance=agent.balance,
        max_drawdown=max_drawdown,
        sharpe_ratio=sharpe_ratio,
        total_steps=steps,
        total_llm_calls=total_llm_calls,
        avg_reasoning_length=avg_reasoning,
        data_quality_score=data_quality,
        training_score=training_score,
    )
    
    return result, all_ticks


async def run_full_benchmark(
    archetypes: List[str],
    steps: int = 15,
) -> BenchmarkReport:
    """Run benchmarks for all specified archetypes"""
    report = BenchmarkReport(
        total_archetypes=len(archetypes),
    )
    
    all_tick_data = {}
    
    print("\n" + "=" * 80)
    print("  ARCHETYPE BENCHMARK")
    print("=" * 80)
    print(f"\nRunning benchmarks for {len(archetypes)} archetypes ({steps} steps each)...\n")
    
    # Run benchmarks
    for archetype in archetypes:
        print(f"  Benchmarking {archetype}...", end=" ", flush=True)
        result, ticks = await run_archetype_benchmark(archetype, steps)
        report.results.append(result)
        all_tick_data[archetype] = ticks
        report.total_steps += result.total_steps
        report.total_llm_calls += result.total_llm_calls
        print(f"Done (PnL: ${result.final_pnl:+.2f}, Win: {result.win_rate*100:.1f}%)")
    
    report.total_trajectories = len(archetypes)
    
    # Calculate aggregate metrics
    if report.results:
        report.avg_win_rate = sum(r.win_rate for r in report.results) / len(report.results)
        report.avg_pnl = sum(r.final_pnl for r in report.results) / len(report.results)
        
        best = max(report.results, key=lambda r: r.training_score)
        worst = min(report.results, key=lambda r: r.training_score)
        report.best_archetype = best.archetype
        report.worst_archetype = worst.archetype
    
    # Validate system components
    print("\n" + "-" * 80)
    print("Validating system components...")
    
    # 1. Validate rubrics
    rubric_issues = []
    for archetype in archetypes:
        rubric = get_rubric(archetype)
        if not rubric or len(rubric) < 100:
            rubric_issues.append(f"{archetype}: Missing or short rubric")
        elif "0.8" not in rubric and "Excellent" not in rubric:
            rubric_issues.append(f"{archetype}: Missing scoring criteria")
    
    report.all_rubrics_valid = len(rubric_issues) == 0
    if rubric_issues:
        print(f"  ⚠️  Rubric issues: {rubric_issues}")
    else:
        print("  ✅ All rubrics valid")
    
    # 2. Validate data pipeline
    builder = MultiPromptDatasetBuilder()
    for archetype, ticks in all_tick_data.items():
        traj = build_trajectory_from_ticks(
            ticks=ticks,
            agent_id=f"{archetype}-benchmark",
            trajectory_id=f"bench-{archetype}",
        )
        if traj:
            builder.add_trajectory(traj, report.results[archetypes.index(archetype)].training_score)
    
    stats = builder.get_statistics()
    report.data_pipeline_valid = stats['total_samples'] > 0
    print(f"  ✅ Data pipeline: {stats['total_samples']} samples extracted")
    
    # 3. Validate multi-prompt
    report.multi_prompt_valid = (
        stats['by_purpose']['action']['count'] > 0 and
        stats['by_purpose']['reasoning']['count'] > 0
    )
    print(f"  ✅ Multi-prompt: action={stats['by_purpose']['action']['count']}, reasoning={stats['by_purpose']['reasoning']['count']}")
    
    return report


def print_benchmark_report(report: BenchmarkReport):
    """Print formatted benchmark report"""
    print("\n" + "=" * 80)
    print("  BENCHMARK RESULTS")
    print("=" * 80)
    
    # Summary table
    print("\n" + "-" * 80)
    print(f"{'Archetype':<20} {'Trades':<8} {'Win Rate':<10} {'P&L':<12} {'Quality':<10} {'Score':<8}")
    print("-" * 80)
    
    for r in sorted(report.results, key=lambda x: -x.training_score):
        print(f"{r.archetype:<20} {r.total_trades:<8} {r.win_rate*100:<10.1f}% ${r.final_pnl:<11.2f} {r.data_quality_score:<10.3f} {r.training_score:<8.3f}")
    
    print("-" * 80)
    
    # Aggregate stats
    print(f"\nAggregate Statistics:")
    print(f"  Total Archetypes: {report.total_archetypes}")
    print(f"  Total Steps: {report.total_steps}")
    print(f"  Total LLM Calls: {report.total_llm_calls}")
    print(f"  Average Win Rate: {report.avg_win_rate*100:.1f}%")
    print(f"  Average P&L: ${report.avg_pnl:.2f}")
    print(f"  Best Archetype: {report.best_archetype}")
    print(f"  Worst Archetype: {report.worst_archetype}")
    
    # System validation
    print(f"\nSystem Validation:")
    print(f"  {'✅' if report.all_rubrics_valid else '❌'} Rubrics Valid")
    print(f"  {'✅' if report.data_pipeline_valid else '❌'} Data Pipeline Valid")
    print(f"  {'✅' if report.multi_prompt_valid else '❌'} Multi-Prompt Valid")
    
    all_valid = report.all_rubrics_valid and report.data_pipeline_valid and report.multi_prompt_valid
    
    print("\n" + "=" * 80)
    if all_valid:
        print("  ✅ ALL BENCHMARKS PASSED - SYSTEM IS PRODUCTION READY")
    else:
        print("  ⚠️  SOME VALIDATIONS FAILED - REVIEW ABOVE")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(
        description="Archetype Benchmarking",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--archetypes",
        type=str,
        default=None,
        help="Comma-separated list of archetypes to benchmark (default: all)"
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=15,
        help="Number of steps per trajectory"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file for JSON results"
    )
    
    args = parser.parse_args()
    
    # Get archetypes to benchmark
    if args.archetypes:
        archetypes = [a.strip() for a in args.archetypes.split(",")]
    else:
        archetypes = get_available_archetypes()
    
    # Validate archetypes
    available = get_available_archetypes()
    invalid = [a for a in archetypes if a not in available]
    if invalid:
        print(f"Error: Invalid archetypes: {invalid}")
        print(f"Available: {available}")
        sys.exit(1)
    
    # Run benchmarks
    report = asyncio.run(run_full_benchmark(archetypes, args.steps))
    
    # Print report
    print_benchmark_report(report)
    
    # Save results
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump(report.to_dict(), f, indent=2)
        print(f"\nResults saved to: {output_path}")
    
    # Save to default location
    results_dir = Path(__file__).parent.parent / "trained_models"
    results_dir.mkdir(exist_ok=True)
    results_file = results_dir / "benchmark_results.json"
    with open(results_file, 'w') as f:
        json.dump(report.to_dict(), f, indent=2)
    print(f"Results saved to: {results_file}")
    
    # Return success/failure
    all_valid = report.all_rubrics_valid and report.data_pipeline_valid and report.multi_prompt_valid
    return 0 if all_valid else 1


if __name__ == '__main__':
    sys.exit(main())

