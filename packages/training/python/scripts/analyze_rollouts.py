#!/usr/bin/env python3
"""
Dataset Generation & Rollout Analysis Script

Generates a comprehensive dataset and analyzes the quality of rollouts
to verify they contain everything needed for RL training.
"""

import asyncio
import json
import sys
import random
from pathlib import Path
from datetime import datetime, timezone

# Add parent to path (to import from src/)
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.training.fast_simulator import FastSimulator, SimulatorConfig, GameState
from src.training.rollout_generator import AgentTickData, RolloutResult
from src.training.quality_utils import calculate_trajectory_quality_score, build_trajectory_from_ticks
from src.training.multi_prompt_dataset import MultiPromptDatasetBuilder
from src.training.tick_reward_attribution import TickRewardAttributor, TickData, TickOutcome, LLMCallRecord, CallPurpose
from src.models import BabylonTrajectory, TrajectoryStep, EnvironmentState, Action, LLMCall

# Configuration
NUM_AGENTS = 8
STEPS_PER_AGENT = 12
AGENT_ARCHETYPES = ['trader', 'degen', 'researcher', 'social-butterfly', 'scammer', 'information-trader', 'perps-trader', 'super-predictor']


class MockAgent:
    """Simulates different agent archetypes with varying behaviors"""
    
    def __init__(self, agent_id: str, archetype: str, skill_level: float):
        self.agent_id = agent_id
        self.archetype = archetype
        self.skill_level = skill_level  # 0.1 to 0.9
        self.balance = 10000.0
        self.pnl = 0.0
        self.positions = 0
        self.trades = 0
        self.wins = 0
        
    async def run_tick(self, agent_id: str, observation: dict, env_state: EnvironmentState) -> AgentTickData:
        """Generate a realistic tick with multiple LLM calls"""
        llm_calls = []
        
        # 1. REASONING call - analyze the market
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
        
        # 2. ACTION call - decide what to do
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
        
        # Execute trade
        success = random.random() < self.skill_level
        pnl_change = 0.0
        
        if action_type in ['buy', 'sell']:
            self.trades += 1
            if success:
                self.wins += 1
                pnl_change = random.uniform(50, 200) * self.skill_level
            else:
                pnl_change = random.uniform(-150, -30) * (1 - self.skill_level)
            
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
        reward = 0.0
        if action_type != 'wait':
            reward = pnl_change / 100.0  # Normalize
        
        return AgentTickData(
            tick_number=0,
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
        prompts = {
            'trader': f'You are {self.agent_id}, a disciplined technical trader focused on risk-adjusted returns. Your win rate target is 55%+.',
            'degen': f'You are {self.agent_id}, a high-risk trader who loves volatile markets. YOLO trades are your specialty.',
            'researcher': f'You are {self.agent_id}, a methodical researcher who analyzes fundamentals before any trade.',
            'social-butterfly': f'You are {self.agent_id}, a social agent who follows sentiment and influencer opinions.',
            'scammer': f'You are {self.agent_id}, a manipulative agent who tries to profit from information asymmetry.',
            'information-trader': f'You are {self.agent_id}, an information arbitrageur who trades on news and data.',
            'perps-trader': f'You are {self.agent_id}, a perpetual futures specialist with high leverage tolerance.',
            'super-predictor': f'You are {self.agent_id}, a prediction market expert who models probabilities carefully.',
        }
        return prompts.get(self.archetype, prompts['trader'])
    
    def _get_reasoning_prompt(self, obs: dict) -> str:
        return f"""Analyze the current market situation:
        
Markets: {json.dumps(obs.get('markets', []), indent=2)[:500]}
Your Balance: ${self.balance:.2f}
Current P&L: ${self.pnl:.2f}
Open Positions: {self.positions}

As a {self.archetype}, what patterns do you see? What's your risk assessment?"""
    
    def _get_action_prompt(self, obs: dict) -> str:
        return f"""Based on your analysis, what action should you take?

Options:
- buy: Enter a long position
- sell: Close or short a position  
- wait: Hold and observe

Your {self.archetype} strategy suggests: What's your move?"""
    
    def _generate_reasoning(self, obs: dict) -> str:
        templates = {
            'trader': f"""Technical Analysis:
1. Market momentum: {'bullish' if random.random() > 0.5 else 'bearish'}
2. Key support/resistance: ${'%.0f' % (random.uniform(95000, 105000))}
3. Volume trend: {'increasing' if random.random() > 0.5 else 'decreasing'}
4. RSI indicator: {random.randint(30, 70)}
5. Risk assessment: {'Low' if self.skill_level > 0.7 else 'Medium' if self.skill_level > 0.4 else 'High'}

Conclusion: Market shows {'opportunity' if random.random() < self.skill_level else 'caution signals'}.""",
            'degen': f"""DEGEN ANALYSIS 🚀
- Moon potential: {'HIGH' if random.random() > 0.5 else 'MEDIUM'}
- Ape factor: {random.randint(7, 10)}/10
- FOMO level: {'EXTREME' if random.random() > 0.7 else 'MODERATE'}
- Gut feeling: {'SEND IT' if random.random() < self.skill_level else 'Maybe wait...'}

LFG! This is {'the way' if random.random() > 0.5 else 'risky but exciting'}!""",
            'researcher': f"""Fundamental Analysis Report:
1. On-chain metrics: {'Strong' if random.random() > 0.5 else 'Weak'}
2. Market cap analysis: Valued {'fairly' if random.random() > 0.5 else 'overvalued'}
3. Network activity: {'Increasing' if random.random() > 0.5 else 'Stable'}
4. Institutional flow: {'Positive' if random.random() > 0.5 else 'Neutral'}
5. Historical correlation: {random.uniform(0.6, 0.95):.2f}

Research conclusion: {'Buy signal' if random.random() < self.skill_level else 'Need more data'}.""",
        }
        return templates.get(self.archetype, templates['trader'])
    
    def _generate_action(self, obs: dict) -> tuple:
        # Determine action based on archetype and skill
        if self.archetype == 'degen':
            action_prob = 0.8  # Degens trade a lot
        elif self.archetype == 'researcher':
            action_prob = 0.4  # Researchers are cautious
        else:
            action_prob = 0.6
            
        if random.random() < action_prob:
            action_type = random.choice(['buy', 'sell'])
            response = f"""Decision: {action_type.upper()}

Rationale ({self.archetype} perspective):
- Signal strength: {random.randint(60, 95)}%
- Expected move: {'positive' if action_type == 'buy' else 'negative'} {random.uniform(2, 8):.1f}%
- Position size: {random.randint(5, 20)}% of portfolio
- Stop loss: {random.uniform(2, 5):.1f}%
- Take profit: {random.uniform(5, 15):.1f}%

Executing {action_type} order now."""
        else:
            action_type = 'wait'
            response = f"""Decision: WAIT

Rationale ({self.archetype} perspective):
- Market clarity: {'Low' if random.random() > 0.5 else 'Uncertain'}
- Risk/reward: Not favorable currently
- Better entry expected at: ${'%.0f' % (random.uniform(95000, 105000))}

Holding position and monitoring."""
        
        return action_type, response


async def generate_dataset():
    # Create simulator
    config = SimulatorConfig(
        mode='data_generation',
        max_ticks=STEPS_PER_AGENT,
    )
    simulator = FastSimulator(config)
    
    # Create agents with varying skill levels
    agents = {}
    for i, archetype in enumerate(AGENT_ARCHETYPES):
        agent_id = f'agent-{i+1}'
        skill = 0.3 + (i * 0.08)  # Skill from 0.3 to 0.86
        agents[agent_id] = MockAgent(agent_id, archetype, skill)
    
    print(f'\nGenerating {NUM_AGENTS} agents × {STEPS_PER_AGENT} steps...\n')
    
    # Run simulation
    all_trajectories = []
    all_tick_data = {agent_id: [] for agent_id in agents}
    
    for tick in range(STEPS_PER_AGENT):
        observation = simulator.get_observation()
        
        for agent_id, agent in agents.items():
            env_state = EnvironmentState(
                agent_balance=agent.balance,
                agent_pnl=agent.pnl,
                open_positions=agent.positions,
            )
            tick_data = await agent.run_tick(agent_id, observation, env_state)
            tick_data.tick_number = tick
            all_tick_data[agent_id].append(tick_data)
        
        simulator._advance_tick()
    
    # Build trajectories
    for agent_id, ticks in all_tick_data.items():
        agent = agents[agent_id]
        traj = build_trajectory_from_ticks(
            ticks=ticks,
            agent_id=agent_id,
            trajectory_id=f'traj-{agent_id}',
        )
        traj.final_pnl = agent.pnl
        traj.final_balance = agent.balance
        traj.trades_executed = agent.trades
        traj.successful_trades = agent.wins
        traj.failed_trades = agent.trades - agent.wins
        
        # Calculate quality combining data completeness AND outcomes
        data_quality = calculate_trajectory_quality_score(ticks)
        
        # P&L component (normalize to 0-1 range, assuming -500 to +500 range)
        pnl_score = max(0.0, min(1.0, (agent.pnl + 500) / 1000))
        
        # Win rate component
        win_rate = agent.wins / agent.trades if agent.trades > 0 else 0.5
        
        # Combined: 30% data quality, 50% P&L, 20% win rate
        quality = data_quality * 0.3 + pnl_score * 0.5 + win_rate * 0.2
        
        all_trajectories.append((traj, quality, agent))
    
    return all_trajectories, all_tick_data, agents


def main():
    print('=' * 80)
    print('  DATASET GENERATION & ROLLOUT ANALYSIS')
    print('=' * 80)
    
    # Run generation
    trajectories, all_tick_data, agents = asyncio.run(generate_dataset())
    
    print('=' * 80)
    print('  ROLLOUT ANALYSIS')
    print('=' * 80)
    
    # Analyze each trajectory
    print('\n[1] TRAJECTORY SUMMARIES')
    print('-' * 80)
    print(f'{"Agent":<12} {"Archetype":<20} {"Skill":<8} {"Trades":<8} {"Win Rate":<10} {"P&L":<12} {"Quality":<8}')
    print('-' * 80)
    
    total_steps = 0
    total_llm_calls = 0
    total_trades = 0
    total_wins = 0
    
    for traj, quality, agent in trajectories:
        win_rate = (agent.wins / agent.trades * 100) if agent.trades > 0 else 0
        print(f'{agent.agent_id:<12} {agent.archetype:<20} {agent.skill_level:<8.2f} {agent.trades:<8} {win_rate:<10.1f}% ${agent.pnl:<11.2f} {quality:<8.3f}')
        
        total_steps += len(traj.steps)
        for step in traj.steps:
            total_llm_calls += len(step.llm_calls)
        total_trades += agent.trades
        total_wins += agent.wins
    
    print('-' * 80)
    overall_win_rate = (total_wins/total_trades*100) if total_trades > 0 else 0
    print(f'Total: {total_steps} steps, {total_llm_calls} LLM calls, {total_trades} trades, {total_wins} wins ({overall_win_rate:.1f}% win rate)')
    
    # Detailed step analysis
    print('\n\n[2] SAMPLE STEP BREAKDOWN')
    print('-' * 80)
    
    sample_traj, sample_quality, sample_agent = trajectories[0]  # Take first trajectory
    sample_step = sample_traj.steps[5] if len(sample_traj.steps) > 5 else sample_traj.steps[0]
    
    print(f'Agent: {sample_agent.agent_id} ({sample_agent.archetype})')
    print(f'Step: {sample_step.step_number}')
    print(f'Balance: ${sample_step.environment_state.agent_balance:.2f}')
    print(f'P&L: ${sample_step.environment_state.agent_pnl:.2f}')
    print(f'LLM Calls: {len(sample_step.llm_calls)}')
    
    for i, call in enumerate(sample_step.llm_calls):
        print(f'\n  Call {i+1} ({call.purpose.upper()}):')
        print(f'    System prompt: {len(call.system_prompt)} chars')
        print(f'    User prompt: {len(call.user_prompt)} chars')
        print(f'    Response: {len(call.response)} chars')
        print(f'    First 100 chars: "{call.response[:100]}..."')
    
    if sample_step.action:
        print(f'\n  Action: {sample_step.action.action_type}')
        print(f'    Success: {sample_step.action.success}')
        if sample_step.action.reasoning:
            print(f'    Reasoning: {sample_step.action.reasoning[:100]}...')
    
    print(f'\n  Reward: {sample_step.reward:.4f}')
    
    # Multi-prompt analysis
    print('\n\n[3] MULTI-PROMPT DATASET ANALYSIS')
    print('-' * 80)
    
    builder = MultiPromptDatasetBuilder()
    for traj, quality, agent in trajectories:
        builder.add_trajectory(traj, quality)
    
    stats = builder.get_statistics()
    print(f'Total Trajectories: {stats["total_trajectories"]}')
    print(f'Total Steps: {stats["total_steps"]}')
    print(f'Total Samples: {stats["total_samples"]}')
    print(f'\nSamples by Purpose:')
    for purpose, data in stats['by_purpose'].items():
        print(f'  {purpose}: {data["count"]} samples (avg_score: {data["avg_score"]:.3f})')
    
    # Tick reward attribution analysis
    print('\n\n[4] TICK REWARD ATTRIBUTION ANALYSIS')
    print('-' * 80)
    
    attributor = TickRewardAttributor()
    print(f'Reward weights:')
    for purpose, weight in attributor.weights.items():
        print(f'  {purpose.value}: {weight:.0%}')
    
    # Analyze a sample tick
    sample_tick_list = all_tick_data[sample_agent.agent_id]
    sample_tick_data = sample_tick_list[5] if len(sample_tick_list) > 5 else sample_tick_list[0]
    
    tick_data = TickData(
        tick_number=5,
        timestamp=sample_tick_data.timestamp,
        agent_id=sample_agent.agent_id,
        llm_calls=[
            LLMCallRecord(
                call_index=i,
                purpose=CallPurpose(call.purpose),
                action_type=sample_tick_data.action.action_type if sample_tick_data.action else None,
                system_prompt=call.system_prompt,
                user_prompt=call.user_prompt,
                response=call.response,
                model=call.model,
                temperature=call.temperature,
                max_tokens=call.max_tokens,
                latency_ms=50,
                led_to_action=(call.purpose == 'action'),
                action_success=sample_tick_data.action.success if sample_tick_data.action else None,
            )
            for i, call in enumerate(sample_tick_data.llm_calls)
        ],
        outcome=TickOutcome(
            tick_number=5,
            pnl_delta=sample_tick_data.reward * 100,
            balance_delta=sample_tick_data.reward * 100,
            trades_executed=1 if sample_tick_data.action and sample_tick_data.action.action_type != 'wait' else 0,
            trades_successful=1 if sample_tick_data.action and sample_tick_data.action.success else 0,
            trades_failed=0,
            posts_created=0,
            responses_sent=0,
            engagement_received=0,
            action_count=1,
            wait_count=0 if sample_tick_data.action and sample_tick_data.action.action_type != 'wait' else 1,
            error_count=0,
        ),
        global_reward=sample_tick_data.reward,
    )
    
    attributed = attributor.attribute_rewards(tick_data)
    print(f'\nSample tick attribution (reward={sample_tick_data.reward:.3f}):')
    for call in attributed:
        print(f'  {call.purpose.value}: {call.attributed_reward:.4f}')
    
    # Quality distribution
    print('\n\n[5] QUALITY SCORE DISTRIBUTION')
    print('-' * 80)
    
    qualities = [q for _, q, _ in trajectories]
    print(f'Min: {min(qualities):.3f}')
    print(f'Max: {max(qualities):.3f}')
    print(f'Mean: {sum(qualities)/len(qualities):.3f}')
    print(f'Range: {max(qualities) - min(qualities):.3f}')
    
    # Check for variance (important for GRPO)
    variance = sum((q - sum(qualities)/len(qualities))**2 for q in qualities) / len(qualities)
    print(f'Variance: {variance:.4f}')
    if variance > 0.005:
        print('✅ Good variance for GRPO training')
    else:
        print('⚠️  Low variance - may need more diverse agents')
    
    # Final validation
    print('\n\n[6] FINAL VALIDATION CHECKLIST')
    print('-' * 80)
    
    checks = []
    
    # Check 1: All steps have LLM calls
    all_have_llm = all(len(step.llm_calls) >= 1 for traj, _, _ in trajectories for step in traj.steps)
    checks.append(('All steps have LLM calls', all_have_llm))
    
    # Check 2: All steps have environment state
    all_have_env = all(step.environment_state is not None for traj, _, _ in trajectories for step in traj.steps)
    checks.append(('All steps have environment state', all_have_env))
    
    # Check 3: Multiple prompt types present
    purposes = set()
    for traj, _, _ in trajectories:
        for step in traj.steps:
            for call in step.llm_calls:
                purposes.add(call.purpose)
    checks.append((f'Multiple prompt types ({len(purposes)})', len(purposes) >= 2))
    
    # Check 4: Quality variance
    checks.append(('Sufficient quality variance', variance > 0.005))
    
    # Check 5: Win rate diversity
    win_rates = [(a.wins/a.trades*100) if a.trades > 0 else 0 for _, _, a in trajectories]
    win_rate_range = max(win_rates) - min(win_rates) if win_rates else 0
    checks.append((f'Win rate diversity ({win_rate_range:.1f}%)', win_rate_range > 20))
    
    # Check 6: P&L diversity
    pnls = [a.pnl for _, _, a in trajectories]
    pnl_range = max(pnls) - min(pnls)
    checks.append((f'P&L diversity (${pnl_range:.0f})', pnl_range > 500))
    
    # Check 7: Response lengths adequate
    min_response = min(len(call.response) for traj, _, _ in trajectories for step in traj.steps for call in step.llm_calls)
    checks.append((f'Min response length ({min_response} chars)', min_response >= 50))
    
    # Check 8: System prompts present
    all_have_system = all(len(call.system_prompt) > 20 for traj, _, _ in trajectories for step in traj.steps for call in step.llm_calls)
    checks.append(('All calls have system prompts', all_have_system))
    
    print()
    all_passed = True
    for check_name, passed in checks:
        status = '✅' if passed else '❌'
        print(f'{status} {check_name}')
        if not passed:
            all_passed = False
    
    print('\n' + '=' * 80)
    if all_passed:
        print('  ✅ ALL VALIDATION CHECKS PASSED - DATASET IS PRODUCTION READY')
    else:
        print('  ⚠️  SOME CHECKS FAILED - REVIEW ISSUES ABOVE')
    print('=' * 80)
    
    return all_passed


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)

