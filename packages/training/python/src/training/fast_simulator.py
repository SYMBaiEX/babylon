"""
Fast Simulator

Unified simulator for both benchmark evaluation and data generation.
Optimized for maximum speed with minimal overhead.

Key features:
- Zero artificial delays
- Minimal memory allocations
- Async batch processing
- Direct database integration
- Real-time metrics

Usage:
    # For benchmarking
    simulator = FastSimulator.for_benchmark(snapshot)
    results = await simulator.run_benchmark(agents)
    
    # For data generation  
    simulator = FastSimulator.for_data_generation(config)
    trajectories = await simulator.generate_data(agents, num_ticks=1000)
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Literal, Protocol

import asyncpg

from ..models import (
    BabylonTrajectory,
    EnvironmentState,
)
from .rollout_generator import AgentTickData, RolloutResult
from .quality_utils import (
    calculate_trajectory_quality_score,
    build_trajectory_from_ticks,
)

logger = logging.getLogger(__name__)


@dataclass
class SimulatorConfig:
    """Configuration for the fast simulator"""
    
    # Mode
    mode: Literal['benchmark', 'data_generation'] = 'data_generation'
    
    # Speed settings
    max_concurrent_agents: int = 8
    
    # Tick settings
    ticks_per_window: int = 60  # Ticks in a 1-hour window
    max_ticks: int = 1000
    
    # Database
    database_url: str = ""
    save_to_db: bool = True
    
    # Quality settings
    min_actions_per_trajectory: int = 5
    
    # Benchmark settings (if mode='benchmark')
    benchmark_snapshot: dict | None = None
    ground_truth: dict | None = None


@dataclass
class SimulatorMetrics:
    """Metrics collected during simulation"""
    
    start_time: float = 0.0
    end_time: float = 0.0
    
    total_ticks: int = 0
    total_agents: int = 0
    total_llm_calls: int = 0
    total_actions: int = 0
    
    successful_trajectories: int = 0
    failed_trajectories: int = 0
    
    avg_tick_duration_ms: float = 0.0
    ticks_per_second: float = 0.0
    
    # Benchmark specific
    total_pnl: float = 0.0
    avg_accuracy: float = 0.0
    avg_optimality: float = 0.0
    
    def finalize(self) -> None:
        """Calculate final metrics"""
        duration = self.end_time - self.start_time
        if duration > 0:
            self.ticks_per_second = self.total_ticks / duration
            if self.total_ticks > 0:
                self.avg_tick_duration_ms = (duration / self.total_ticks) * 1000


class AgentRunner(Protocol):
    """Protocol for running agents"""
    
    async def run_tick(
        self,
        agent_id: str,
        observation: dict,
        env_state: EnvironmentState,
    ) -> AgentTickData:
        """Run a single agent tick"""
        ...


@dataclass
class GameState:
    """Minimal game state for fast simulation"""
    
    tick: int = 0
    time: int = 0
    
    # Markets (simplified)
    markets: list[dict] = field(default_factory=list)
    perpetuals: list[dict] = field(default_factory=list)
    
    # News/Social
    news: list[dict] = field(default_factory=list)
    posts: list[dict] = field(default_factory=list)
    
    # Agent states
    portfolios: dict[str, dict] = field(default_factory=dict)
    
    def to_observation(self) -> dict:
        """Convert to agent observation"""
        return {
            "tick": self.tick,
            "time": self.time,
            "markets": self.markets,
            "perpetuals": self.perpetuals,
            "news": self.news[:5],  # Limit for speed
            "posts": self.posts[:10],
        }
    
    def get_env_state(self, agent_id: str) -> EnvironmentState:
        """Get environment state for an agent"""
        portfolio = self.portfolios.get(agent_id, {})
        return EnvironmentState(
            agent_balance=portfolio.get("balance", 10000.0),
            agent_pnl=portfolio.get("pnl", 0.0),
            open_positions=portfolio.get("positions", 0),
            active_markets=len(self.markets),
        )


class FastSimulator:
    """
    Fast simulator for benchmarking and data generation.
    
    Optimized for throughput with minimal overhead.
    """
    
    def __init__(self, config: SimulatorConfig):
        self.config = config
        self.metrics = SimulatorMetrics()
        self.db_pool: asyncpg.Pool | None = None
        
        # State
        self.current_tick = 0
        self.game_state = GameState()
        self.agent_trajectories: dict[str, list[AgentTickData]] = {}
        
        # Benchmark data (if applicable)
        self.benchmark_ticks: list[dict] = []
        self.ground_truth: dict = {}
    
    @classmethod
    def for_benchmark(cls, snapshot: dict) -> "FastSimulator":
        """Create simulator for benchmarking"""
        config = SimulatorConfig(
            mode='benchmark',
            benchmark_snapshot=snapshot,
            ground_truth=snapshot.get('groundTruth', {}),
            max_ticks=len(snapshot.get('ticks', [])),
        )
        
        sim = cls(config)
        sim.benchmark_ticks = snapshot.get('ticks', [])
        sim.ground_truth = snapshot.get('groundTruth', {})
        sim.game_state = cls._parse_initial_state(snapshot.get('initialState', {}))
        
        return sim
    
    @classmethod
    def for_data_generation(
        cls,
        database_url: str,
        ticks_per_window: int = 60,
        max_concurrent_agents: int = 8,
    ) -> "FastSimulator":
        """Create simulator for data generation"""
        config = SimulatorConfig(
            mode='data_generation',
            database_url=database_url,
            ticks_per_window=ticks_per_window,
            max_concurrent_agents=max_concurrent_agents,
            save_to_db=True,
        )
        return cls(config)
    
    @staticmethod
    def _parse_initial_state(state_dict: dict) -> GameState:
        """Parse initial state from snapshot"""
        return GameState(
            tick=0,
            time=state_dict.get('currentTime', int(time.time() * 1000)),
            markets=state_dict.get('predictionMarkets', []),
            perpetuals=state_dict.get('perpetualMarkets', []),
            news=state_dict.get('news', []),
            posts=state_dict.get('socialFeed', []),
        )
    
    async def initialize(self) -> None:
        """Initialize simulator"""
        if self.config.database_url and self.config.save_to_db:
            self.db_pool = await asyncpg.create_pool(
                self.config.database_url,
                min_size=2,
                max_size=10,
            )
            logger.info("Database connection pool created")
        
        self.metrics.start_time = time.time()
        self.current_tick = 0
        self.agent_trajectories = {}
        
        logger.info(
            f"Simulator initialized: mode={self.config.mode}, "
            f"max_ticks={self.config.max_ticks}"
        )
    
    async def cleanup(self) -> None:
        """Clean up resources"""
        if self.db_pool:
            await self.db_pool.close()
            self.db_pool = None
    
    def is_complete(self) -> bool:
        """Check if simulation is complete"""
        if self.config.mode == 'benchmark':
            return self.current_tick >= len(self.benchmark_ticks)
        return self.current_tick >= self.config.max_ticks
    
    def get_observation(self) -> dict:
        """Get current observation for agents"""
        return self.game_state.to_observation()
    
    def get_env_state(self, agent_id: str) -> EnvironmentState:
        """Get environment state for an agent"""
        return self.game_state.get_env_state(agent_id)
    
    async def run_tick(
        self,
        agent_runners: dict[str, AgentRunner],
    ) -> dict[str, AgentTickData]:
        """
        Run one simulation tick for all agents in parallel.
        
        This is the core fast path - uses asyncio.gather for true parallel execution.
        """
        tick_start = time.time()
        
        # Get observation once (shared across agents)
        observation = self.get_observation()
        
        # Create coroutines for all agents
        agent_ids = list(agent_runners.keys())
        coros = []
        for agent_id in agent_ids:
            runner = agent_runners[agent_id]
            env_state = self.get_env_state(agent_id)
            coros.append(runner.run_tick(agent_id, observation, env_state))
        
        # Run ALL agents truly in parallel
        tick_results = await asyncio.gather(*coros, return_exceptions=True)
        
        # Process results
        results = {}
        current_time = int(time.time() * 1000)
        
        for agent_id, tick_data in zip(agent_ids, tick_results):
            # Handle exceptions from individual agents
            if isinstance(tick_data, Exception):
                logger.error(f"Agent {agent_id} tick failed: {tick_data}")
                continue
            
            tick_data.tick_number = self.current_tick
            tick_data.timestamp = current_time
            results[agent_id] = tick_data
            
            # Track in trajectory
            if agent_id not in self.agent_trajectories:
                self.agent_trajectories[agent_id] = []
            self.agent_trajectories[agent_id].append(tick_data)
            
            # Update metrics
            self.metrics.total_llm_calls += len(tick_data.llm_calls)
            if tick_data.action:
                self.metrics.total_actions += 1
        
        # Apply actions to game state
        await self._apply_actions(results)
        
        # Update state for next tick
        self._advance_tick()
        
        # Track timing
        self.metrics.total_ticks += 1
        
        return results
    
    async def _apply_actions(self, tick_results: dict[str, AgentTickData]) -> None:
        """Apply agent actions to game state"""
        for agent_id, tick_data in tick_results.items():
            if not tick_data.action:
                continue
            
            action = tick_data.action
            portfolio = self.game_state.portfolios.get(agent_id, {
                "balance": 10000.0,
                "pnl": 0.0,
                "positions": 0,
            })
            
            # Process action (simplified)
            if action.action_type in ['buy', 'buy_prediction', 'open_perp']:
                portfolio["positions"] += 1
                # Simulate some cost
                cost = action.parameters.get("amount", 100)
                portfolio["balance"] -= cost
                
            elif action.action_type in ['sell', 'sell_prediction', 'close_perp']:
                portfolio["positions"] = max(0, portfolio["positions"] - 1)
                # Simulate some profit/loss
                pnl = action.parameters.get("pnl", 0)
                portfolio["pnl"] += pnl
                portfolio["balance"] += pnl
            
            self.game_state.portfolios[agent_id] = portfolio
            # Don't override agent's success flag - agent determines trade success
    
    def _advance_tick(self) -> None:
        """Advance to next tick"""
        self.current_tick += 1
        
        if self.config.mode == 'benchmark' and self.current_tick < len(self.benchmark_ticks):
            # Load next tick's state from benchmark
            tick_data = self.benchmark_ticks[self.current_tick]
            state = tick_data.get('state', {})
            self.game_state.tick = self.current_tick
            self.game_state.time = state.get('currentTime', self.game_state.time + 1000)
            self.game_state.markets = state.get('predictionMarkets', self.game_state.markets)
            self.game_state.perpetuals = state.get('perpetualMarkets', self.game_state.perpetuals)
            self.game_state.news = state.get('news', self.game_state.news)
            self.game_state.posts = state.get('socialFeed', self.game_state.posts)
        else:
            # Increment time
            self.game_state.tick = self.current_tick
            self.game_state.time += 1000  # 1 second per tick
    
    async def run_benchmark(
        self,
        agent_runners: dict[str, AgentRunner],
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict[str, RolloutResult]:
        """
        Run complete benchmark for all agents.
        
        Args:
            agent_runners: Dict of agent_id -> AgentRunner
            progress_callback: Optional callback (current_tick, total_ticks)
            
        Returns:
            Dict of agent_id -> RolloutResult
        """
        await self.initialize()
        
        self.metrics.total_agents = len(agent_runners)
        total_ticks = len(self.benchmark_ticks)
        
        logger.info(f"Starting benchmark: {len(agent_runners)} agents, {total_ticks} ticks")
        
        # Run through all ticks
        while not self.is_complete():
            await self.run_tick(agent_runners)
            
            if progress_callback and self.current_tick % 10 == 0:
                progress_callback(self.current_tick, total_ticks)
        
        # Calculate results
        results = {}
        for agent_id, ticks in self.agent_trajectories.items():
            result = self._calculate_benchmark_result(agent_id, ticks)
            results[agent_id] = result
        
        self.metrics.end_time = time.time()
        self.metrics.finalize()
        
        # Log summary
        logger.info(
            f"Benchmark complete: {self.metrics.total_ticks} ticks "
            f"at {self.metrics.ticks_per_second:.1f} ticks/s"
        )
        
        await self.cleanup()
        
        return results
    
    async def generate_data(
        self,
        agent_runners: dict[str, AgentRunner],
        num_ticks: int | None = None,
    ) -> list[BabylonTrajectory]:
        """
        Generate training data by running agents.
        
        Args:
            agent_runners: Dict of agent_id -> AgentRunner
            num_ticks: Number of ticks to run (default: config.max_ticks)
            
        Returns:
            List of trajectories
        """
        await self.initialize()
        
        self.metrics.total_agents = len(agent_runners)
        max_ticks = num_ticks or self.config.max_ticks
        
        logger.info(f"Starting data generation: {len(agent_runners)} agents, {max_ticks} ticks")
        
        # Run through ticks
        while self.current_tick < max_ticks:
            await self.run_tick(agent_runners)
            
            if self.current_tick % 100 == 0:
                logger.info(f"Progress: {self.current_tick}/{max_ticks} ticks")
        
        # Build trajectories
        trajectories = []
        for agent_id, ticks in self.agent_trajectories.items():
            trajectory = self._build_trajectory(agent_id, ticks)
            if trajectory:
                trajectories.append(trajectory)
                self.metrics.successful_trajectories += 1
            else:
                self.metrics.failed_trajectories += 1
        
        # Save to database if configured
        if self.config.save_to_db and self.db_pool:
            await self._save_trajectories(trajectories)
        
        self.metrics.end_time = time.time()
        self.metrics.finalize()
        
        logger.info(
            f"Data generation complete: {len(trajectories)} trajectories, "
            f"{self.metrics.ticks_per_second:.1f} ticks/s"
        )
        
        await self.cleanup()
        
        return trajectories
    
    def _calculate_benchmark_result(
        self,
        agent_id: str,
        ticks: list[AgentTickData],
    ) -> RolloutResult:
        """Calculate benchmark result for an agent"""
        if not ticks:
            return RolloutResult(
                agent_id=agent_id,
                trajectory_id=f"bench-{agent_id}",
                ticks_completed=0,
                total_duration_ms=0,
                avg_tick_duration_ms=0,
                total_llm_calls=0,
                total_reward=0,
                final_pnl=0,
                quality_score=0,
            )
        
        total_llm_calls = sum(len(t.llm_calls) for t in ticks)
        total_reward = sum(t.reward for t in ticks)
        final_pnl = ticks[-1].environment_state.agent_pnl
        
        # Calculate quality score
        quality_score = self._calculate_quality_score(ticks)
        
        # Calculate accuracy against ground truth
        if self.ground_truth:
            self._evaluate_against_ground_truth(agent_id, ticks)
        
        duration = (ticks[-1].timestamp - ticks[0].timestamp) if len(ticks) > 1 else 0
        
        return RolloutResult(
            agent_id=agent_id,
            trajectory_id=f"bench-{agent_id}-{int(time.time())}",
            ticks_completed=len(ticks),
            total_duration_ms=duration,
            avg_tick_duration_ms=duration / len(ticks) if ticks else 0,
            total_llm_calls=total_llm_calls,
            total_reward=total_reward,
            final_pnl=final_pnl,
            quality_score=quality_score,
            trajectory=self._build_trajectory(agent_id, ticks),
        )
    
    def _calculate_quality_score(self, ticks: list[AgentTickData]) -> float:
        """Calculate quality score for tick data"""
        return calculate_trajectory_quality_score(ticks)
    
    def _evaluate_against_ground_truth(
        self,
        agent_id: str,
        ticks: list[AgentTickData],
    ) -> None:
        """Evaluate agent actions against ground truth"""
        market_outcomes = self.ground_truth.get('marketOutcomes', {})
        
        correct_predictions = 0
        total_predictions = 0
        
        for tick in ticks:
            if not tick.action:
                continue
            
            if tick.action.action_type == 'buy_prediction':
                market_id = tick.action.parameters.get('marketId')
                predicted = tick.action.parameters.get('outcome') == 'YES'
                
                if market_id in market_outcomes:
                    actual = market_outcomes[market_id]
                    if predicted == actual:
                        correct_predictions += 1
                    total_predictions += 1
        
        if total_predictions > 0:
            accuracy = correct_predictions / total_predictions
            self.metrics.avg_accuracy = (
                self.metrics.avg_accuracy * (self.metrics.total_agents - 1) + accuracy
            ) / self.metrics.total_agents
    
    def _build_trajectory(
        self,
        agent_id: str,
        ticks: list[AgentTickData],
    ) -> BabylonTrajectory | None:
        """Build trajectory from tick data"""
        trajectory_id = f"traj-{agent_id}-{int(time.time()*1000)}"
        return build_trajectory_from_ticks(
            trajectory_id=trajectory_id,
            agent_id=agent_id,
            ticks=ticks,
            min_steps=self.config.min_actions_per_trajectory,
        )
    
    async def _save_trajectories(self, trajectories: list[BabylonTrajectory]) -> None:
        """Save trajectories to database"""
        if not self.db_pool:
            return
        
        async with self.db_pool.acquire() as conn:
            for traj in trajectories:
                steps_json = json.dumps([
                    {
                        "stepNumber": s.step_number,
                        "timestamp": s.timestamp,
                        "environmentState": {
                            "agentBalance": s.environment_state.agent_balance,
                            "agentPnL": s.environment_state.agent_pnl,
                            "openPositions": s.environment_state.open_positions,
                        },
                        "llmCalls": [
                            {
                                "model": c.model,
                                "systemPrompt": c.system_prompt,
                                "userPrompt": c.user_prompt,
                                "response": c.response,
                                "reasoning": c.reasoning,
                                "temperature": c.temperature,
                                "maxTokens": c.max_tokens,
                                "purpose": c.purpose,
                            }
                            for c in s.llm_calls
                        ],
                        "action": {
                            "actionType": s.action.action_type,
                            "parameters": s.action.parameters,
                            "success": s.action.success,
                            "reasoning": s.action.reasoning,
                        },
                        "reward": s.reward,
                    }
                    for s in traj.steps
                ])
                
                await conn.execute("""
                    INSERT INTO trajectories (
                        id, "trajectoryId", "agentId", "windowId",
                        "startTime", "endTime", "durationMs",
                        "stepsJson", "totalReward", "finalPnL", "finalBalance",
                        "tradesExecuted", "episodeLength", "finalStatus",
                        "isTrainingData", "createdAt", "updatedAt"
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
                    )
                """,
                    traj.id,
                    traj.trajectory_id,
                    traj.agent_id,
                    traj.window_id,
                    traj.start_time,
                    traj.end_time,
                    traj.duration_ms,
                    steps_json,
                    traj.total_reward,
                    traj.final_pnl,
                    traj.final_balance,
                    traj.trades_executed,
                    traj.episode_length,
                    traj.final_status,
                    True,  # isTrainingData
                    datetime.now(timezone.utc),
                    datetime.now(timezone.utc),
                )
        
        logger.info(f"Saved {len(trajectories)} trajectories to database")
    
    def get_metrics(self) -> SimulatorMetrics:
        """Get current metrics"""
        return self.metrics
    
    def print_metrics(self) -> None:
        """Print metrics summary"""
        m = self.metrics
        print("\n" + "=" * 60)
        print("  SIMULATOR METRICS")
        print("=" * 60)
        print(f"  Mode: {self.config.mode}")
        print(f"  Total ticks: {m.total_ticks}")
        print(f"  Total agents: {m.total_agents}")
        print(f"  Ticks/second: {m.ticks_per_second:.1f}")
        print(f"  Avg tick duration: {m.avg_tick_duration_ms:.2f}ms")
        print(f"  Total LLM calls: {m.total_llm_calls}")
        print(f"  Total actions: {m.total_actions}")
        if m.successful_trajectories or m.failed_trajectories:
            print(f"  Successful trajectories: {m.successful_trajectories}")
            print(f"  Failed trajectories: {m.failed_trajectories}")
        if m.avg_accuracy > 0:
            print(f"  Average accuracy: {m.avg_accuracy:.2%}")
        print("=" * 60 + "\n")

