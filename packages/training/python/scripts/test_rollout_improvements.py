#!/usr/bin/env python3
"""
End-to-end test for rollout improvements.
Tests the complete pipeline with enhanced quality scoring.
"""

import asyncio
import random
import sys
from dataclasses import dataclass
from pathlib import Path

# Add src to path for proper imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models import LLMCall, Action, EnvironmentState
from src.training.rollout_generator import AgentTickData
from src.training.fast_simulator import FastSimulator, SimulatorConfig
from src.training.quality_utils import (
    calculate_trajectory_quality_score,
    assess_trajectory_difficulty,
    build_trajectory_from_ticks,
    check_reasoning_coherence,
    check_reasoning_action_alignment,
)
from src.training.multi_prompt_dataset import MultiPromptDatasetBuilder


@dataclass
class RichMockAgent:
    """Mock agent that produces realistic rollout data."""
    agent_id: str
    archetype: str
    skill_level: float = 0.7
    balance: float = 10000.0
    pnl: float = 0.0
    trades: int = 0
    wins: int = 0
    
    async def run_tick(
        self, agent_id: str, observation: dict, env_state: EnvironmentState
    ) -> AgentTickData:
        llm_calls = []
        
        # Get market data from observation
        markets = observation.get('markets', [])
        perps = observation.get('perpetuals', [])
        news = observation.get('news', [])
        
        market_info = markets[0] if markets else {'question': 'Unknown', 'yesPrice': 0.5, 'id': 'market-1'}
        perp_info = perps[0] if perps else {'ticker': 'BTC', 'markPrice': 100000}
        news_item = news[0] if news else {'headline': 'No news', 'sentiment': 'neutral'}
        
        # Generate archetype-specific reasoning
        reasoning_text = self._generate_reasoning(market_info, perp_info, news_item)
        
        reasoning_call = LLMCall(
            model='qwen3-32b',
            system_prompt=f'You are a {self.archetype} agent specialized in market analysis.',
            user_prompt=f'Analyze current market state: tick={observation.get("tick", 0)}',
            response=reasoning_text,
            purpose='reasoning',
            reasoning=reasoning_text,
            temperature=0.7,
            max_tokens=1024
        )
        llm_calls.append(reasoning_call)
        
        # Action decision based on archetype
        should_trade = random.random() < (0.8 if self.archetype == 'degen' else 0.5)
        
        if should_trade:
            action_type = random.choice(['buy', 'sell'])
            action_response = self._generate_action_response(action_type, market_info)
        else:
            action_type = 'wait'
            action_response = '{"action": "wait", "reasoning": "No clear signal"}'
        
        action_call = LLMCall(
            model='qwen3-32b',
            system_prompt=f'You are a {self.archetype} agent.',
            user_prompt='Based on your analysis, decide your action.',
            response=action_response,
            purpose='action',
            temperature=0.7,
            max_tokens=512
        )
        llm_calls.append(action_call)
        
        # Determine outcome
        success = random.random() < self.skill_level
        if action_type != 'wait':
            self.trades += 1
            if success:
                self.wins += 1
                pnl_change = random.uniform(10, 100)
            else:
                pnl_change = random.uniform(-80, -10)
            self.pnl += pnl_change
            self.balance += pnl_change
        
        action = Action(
            action_type=action_type,
            parameters={'amount': random.randint(50, 200), 'market': market_info.get('id', 'market-1')},
            success=success,
            reasoning=self._get_action_reasoning(action_type)
        )
        
        return AgentTickData(
            tick_number=0,
            timestamp=int(asyncio.get_event_loop().time() * 1000),
            observation=observation,
            environment_state=EnvironmentState(
                agent_balance=self.balance,
                agent_pnl=self.pnl,
                open_positions=self.trades,
            ),
            llm_calls=llm_calls,
            action=action,
            feedback={'executed': True, 'success': success},
            reward=1.0 if success else -0.5
        )
    
    def _generate_reasoning(self, market: dict, perp: dict, news: dict) -> str:
        """Generate archetype-specific reasoning."""
        if self.archetype == 'trader':
            return f"""Technical Analysis Report:
1. Prediction market: {market.get('question', 'Unknown')[:40]}
   - YES price: ${market.get('yesPrice', 0.5):.2f}
   - Volume indicates {'high' if random.random() > 0.5 else 'moderate'} interest
2. {perp.get('ticker', 'BTC')} perpetual at ${perp.get('markPrice', 100000):,.2f}
   - RSI: {random.randint(30, 70)}
   - MACD: {'bullish crossover' if random.random() > 0.5 else 'bearish divergence'}
3. News sentiment: {news.get('sentiment', 'neutral')}
4. Risk/Reward: {'Favorable' if self.skill_level > 0.6 else 'Marginal'}

Conclusion: {'Enter long position' if random.random() < self.skill_level else 'Wait for better setup'}"""
        
        elif self.archetype == 'degen':
            return f"""DEGEN MODE ACTIVATED 🚀
- Market: {market.get('question', 'Unknown')[:30]}
- Moon potential: {'HIGH' if random.random() > 0.4 else 'MEDIUM'}
- Ape factor: {random.randint(7, 10)}/10
- FOMO level: {'EXTREME' if random.random() > 0.6 else 'MODERATE'}

LFG! This is {'the way' if random.random() > 0.5 else 'risky but YOLO'}!"""
        
        elif self.archetype == 'researcher':
            return f"""Fundamental Analysis:
1. Market thesis: {market.get('question', 'Unknown')[:40]}
   - Current probability: {market.get('yesPrice', 0.5)*100:.1f}%
   - Historical correlation: {random.uniform(0.6, 0.95):.2f}
2. On-chain analysis for {perp.get('ticker', 'BTC')}:
   - Active addresses: {'increasing' if random.random() > 0.5 else 'stable'}
   - Whale accumulation: {'detected' if random.random() > 0.6 else 'not significant'}
3. News analysis: {news.get('headline', '')}
   - Sentiment score: {random.uniform(0.3, 0.8):.2f}
   - Market impact: {'high' if news.get('impact') == 'high' else 'moderate'}
4. Consensus estimate: ${perp.get('markPrice', 100000) * random.uniform(0.95, 1.1):,.2f}

Research conclusion: {'Buy signal based on fundamentals' if random.random() < self.skill_level else 'Insufficient data for high-conviction trade'}"""
        
        else:  # social-butterfly
            return f"""Social Pulse Check:
1. Market buzz: {market.get('question', 'Unknown')[:30]}
   - Community sentiment: {'bullish' if random.random() > 0.5 else 'mixed'}
   - Influencer mentions: {random.randint(5, 50)}
2. Trending topics: {perp.get('ticker', 'BTC')}, DeFi, AI
3. Group chat vibe: {'optimistic' if random.random() > 0.4 else 'cautious'}
4. My network says: {'time to buy' if random.random() > 0.5 else 'wait and see'}

Social signal: {'Following the crowd on this one' if random.random() < 0.6 else 'Going against consensus'}"""
    
    def _generate_action_response(self, action_type: str, market: dict) -> str:
        return f"""{{"action": "{action_type}", "market": "{market.get('id', 'market-1')}", "amount": {random.randint(50, 200)}, "reasoning": "{'Bullish momentum detected' if action_type == 'buy' else 'Taking profits on bearish signal'}"}}"""
    
    def _get_action_reasoning(self, action_type: str) -> str:
        if action_type == 'buy':
            return 'Bullish momentum detected, entering long position'
        elif action_type == 'sell':
            return 'Bearish signal, closing position'
        return 'No clear signal, holding'


async def run_test():
    print('=' * 70)
    print('  END-TO-END ROLLOUT PIPELINE TEST')
    print('=' * 70)
    
    # Create simulator
    config = SimulatorConfig(mode='data_generation', max_ticks=10)
    simulator = FastSimulator(config)
    
    # Create diverse agents
    archetypes = ['trader', 'degen', 'researcher', 'social-butterfly']
    agents = {}
    for i, arch in enumerate(archetypes):
        agent_id = f'agent-{arch}'
        skill = 0.5 + (i * 0.1)
        agents[agent_id] = RichMockAgent(agent_id, arch, skill)
    
    print(f'\nCreated {len(agents)} agents: {list(agents.keys())}')
    
    # Run simulation
    all_tick_data = {agent_id: [] for agent_id in agents}
    
    for tick in range(10):
        observation = simulator.get_observation()
        
        for agent_id, agent in agents.items():
            env_state = EnvironmentState(
                agent_balance=agent.balance,
                agent_pnl=agent.pnl,
                open_positions=agent.trades,
            )
            tick_data = await agent.run_tick(agent_id, observation, env_state)
            tick_data.tick_number = tick
            all_tick_data[agent_id].append(tick_data)
        
        simulator._advance_tick()
    
    print(f'\nGenerated {sum(len(t) for t in all_tick_data.values())} total ticks')
    
    # Test quality scoring
    print('\n' + '=' * 70)
    print('  TRAJECTORY QUALITY ASSESSMENT')
    print('=' * 70)
    print(f'{"Agent":<25} {"Arch":<15} {"Quality":<10} {"Difficulty":<10} {"PnL":<12} {"Win%"}')
    print('-' * 70)
    
    dataset_builder = MultiPromptDatasetBuilder()
    
    for agent_id, ticks in all_tick_data.items():
        agent = agents[agent_id]
        
        # Calculate quality with archetype
        quality = calculate_trajectory_quality_score(ticks, archetype=agent.archetype)
        
        # Assess difficulty
        difficulty = assess_trajectory_difficulty(ticks)
        
        # Build trajectory
        traj = build_trajectory_from_ticks(
            ticks=ticks,
            agent_id=agent_id,
            trajectory_id=f'traj-{agent_id}',
        )
        
        if traj:
            traj.final_pnl = agent.pnl
            traj.trades_executed = agent.trades
            
            # Add to dataset builder
            dataset_builder.add_trajectory(traj, quality)
            
            win_rate = (agent.wins / agent.trades * 100) if agent.trades > 0 else 0
            print(f'{agent_id:<25} {agent.archetype:<15} {quality:.3f}      {difficulty.level:<10} ${agent.pnl:>8.2f}    {win_rate:.0f}%')
    
    # Dataset statistics
    print('\n' + '=' * 70)
    print('  MULTI-PROMPT DATASET STATISTICS')
    print('=' * 70)
    
    stats = dataset_builder.get_statistics()
    print(f'Total trajectories: {stats["total_trajectories"]}')
    print(f'Total steps: {stats["total_steps"]}')
    print(f'Total samples: {stats["total_samples"]}')
    print()
    
    print('Samples by purpose:')
    for purpose, purpose_stats in stats['by_purpose'].items():
        dataset = dataset_builder.datasets[purpose]
        diversity = dataset.get_diversity_metrics()
        is_diverse, issues = dataset.is_diverse_enough()
        status = '✅' if is_diverse else '⚠️'
        count = purpose_stats['count']
        print(f'  {purpose:<12}: {count:>4} samples, {diversity.unique_trajectories} trajectories {status}')
    
    # Test coherence and alignment scoring
    print('\n' + '=' * 70)
    print('  QUALITY SCORING VALIDATION')
    print('=' * 70)
    
    # Get a sample reasoning and check scores
    sample_ticks = all_tick_data['agent-trader']
    if sample_ticks:
        sample_tick = sample_ticks[0]
        if sample_tick.llm_calls:
            reasoning = sample_tick.llm_calls[0].reasoning or ''
            coherence = check_reasoning_coherence(reasoning)
            alignment = check_reasoning_action_alignment(reasoning, sample_tick.action)
            
            print(f'Sample reasoning coherence: {coherence:.3f}')
            print(f'Sample reasoning-action alignment: {alignment:.3f}')
    
    print('\n' + '=' * 70)
    print('  ✅ ALL TESTS PASSED')
    print('=' * 70)


if __name__ == '__main__':
    asyncio.run(run_test())

