"""
PostgreSQL Trajectory Reader
Strong types, async, no error hiding
"""

import asyncpg
from typing import List
import logging
import json
from datetime import datetime, timedelta

from ..models import BabylonTrajectory, MarketOutcomes, WindowStatistics, StockOutcome, TrajectoryStep, EnvironmentState, LLMCall, Action, ProviderAccess

logger = logging.getLogger(__name__)


class PostgresTrajectoryReader:
    """Read Babylon trajectories from PostgreSQL - fail fast on errors"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.pool: asyncpg.Pool | None = None
        
    async def connect(self):
        """Initialize connection pool - raises on failure"""
        if self.pool is None:
            self.pool = await asyncpg.create_pool(
                self.db_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("PostgreSQL connection pool created")
    
    async def close(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            self.pool = None
            logger.info("PostgreSQL connection pool closed")
    
    async def get_window_ids(
        self,
        min_agents: int = 5,
        lookback_hours: int = 24
    ) -> List[str]:
        """
        Get window IDs with enough agents
        
        Raises:
            RuntimeError: If not connected
            asyncpg.PostgresError: On query failure
        """
        if not self.pool:
            raise RuntimeError("Not connected - call connect() first")
        
        # Calculate cutoff time
        cutoff_time = datetime.now() - timedelta(hours=lookback_hours)
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT "windowId"
                FROM trajectories
                WHERE 
                    "windowId" IS NOT NULL
                    AND "createdAt" > $1
                GROUP BY "windowId"
                HAVING COUNT(DISTINCT "agentId") >= $2
                ORDER BY "windowId" DESC
                """,
                cutoff_time,
                min_agents
            )
            
        return [row['windowId'] for row in rows]
    
    async def get_trajectories_by_window(
        self,
        window_id: str,
        min_actions: int = 5
    ) -> List[BabylonTrajectory]:
        """
        Get all trajectories for a window
        
        Returns validated Pydantic models - raises on validation errors
        """
        if not self.pool:
            raise RuntimeError("Not connected - call connect() first")
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    id, "trajectoryId", "agentId", "windowId",
                    "startTime", "endTime", "durationMs",
                    "scenarioId", "episodeId",
                    "stepsJson", "totalReward", "finalPnL", "finalBalance",
                    "tradesExecuted", "postsCreated", "episodeLength", "finalStatus"
                FROM trajectories
                WHERE "windowId" = $1
                ORDER BY "createdAt"
                """,
                window_id
            )
        
        trajectories = []
        for row in rows:
            # Parse steps JSON
            steps_data = json.loads(row['stepsJson'] or '[]')
            
            if not steps_data:
                continue
            
            # Validate and convert steps
            steps = []
            for s in steps_data:
                # Handle both snake_case and camelCase keys in step data
                step_num = s.get('stepNumber', s.get('step_number', 0))
                ts = s.get('timestamp', 0)
                env_state_data = s.get('environmentState', s.get('environment_state', {}))
                
                # Build environment state with flexible key access
                env_state = EnvironmentState(
                    agent_balance=env_state_data.get('agentBalance', env_state_data.get('agent_balance', 0)),
                    agent_pnl=env_state_data.get('agentPnL', env_state_data.get('agent_pnl', 0)),
                    open_positions=env_state_data.get('openPositions', env_state_data.get('open_positions', 0)),
                    active_markets=env_state_data.get('activeMarkets', env_state_data.get('active_markets', 0)),
                )
                
                # Provider accesses
                provider_data = s.get('providerAccesses', s.get('provider_accesses', []))
                provider_accesses = [ProviderAccess(**p) for p in provider_data] if provider_data else []
                
                # LLM calls
                llm_data = s.get('llmCalls', s.get('llm_calls', []))
                llm_calls = []
                for llm in llm_data:
                    llm_calls.append(LLMCall(
                        model=llm.get('model', ''),
                        system_prompt=llm.get('systemPrompt', llm.get('system_prompt', '')),
                        user_prompt=llm.get('userPrompt', llm.get('user_prompt', '')),
                        response=llm.get('response', ''),
                        reasoning=llm.get('reasoning'),
                        temperature=llm.get('temperature', 0.7),
                        max_tokens=llm.get('maxTokens', llm.get('max_tokens', 100)),
                        latency_ms=llm.get('latencyMs', llm.get('latency_ms')),
                        purpose=llm.get('purpose', 'action'),
                        action_type=llm.get('actionType', llm.get('action_type'))
                    ))
                
                # Action
                action_data = s.get('action', {})
                action = Action(
                    action_type=action_data.get('actionType', action_data.get('action_type', 'wait')),
                    parameters=action_data.get('parameters', {}),
                    success=action_data.get('success', True),
                    result=action_data.get('result'),
                    error=action_data.get('error'),
                    reasoning=action_data.get('reasoning'),
                )
                
                steps.append(TrajectoryStep(
                    step_number=step_num,
                    timestamp=ts,
                    environment_state=env_state,
                    provider_accesses=provider_accesses,
                    llm_calls=llm_calls,
                    action=action,
                    reward=s.get('reward', 0.0)
                ))
            
            # Only include if meets minimum actions
            if len(steps) >= min_actions:
                trajectories.append(BabylonTrajectory(
                    id=row['id'],
                    trajectory_id=row['trajectoryId'],
                    agent_id=row['agentId'],
                    window_id=row['windowId'],
                    start_time=row['startTime'],
                    end_time=row['endTime'],
                    duration_ms=row['durationMs'] or 0,
                    scenario_id=row['scenarioId'],
                    episode_id=row['episodeId'],
                    steps=steps,
                    total_reward=float(row['totalReward'] or 0),
                    final_pnl=float(row['finalPnL'] or 0),
                    final_balance=float(row['finalBalance']) if row['finalBalance'] else None,
                    trades_executed=row['tradesExecuted'] or 0,
                    posts_created=row['postsCreated'] or 0,
                    episode_length=row['episodeLength'] or len(steps),
                    final_status=row['finalStatus'] or 'unknown'
                ))
        
        return trajectories
    
    async def get_market_outcomes(self, window_id: str) -> MarketOutcomes | None:
        """Get market outcomes for window - strong types"""
        if not self.pool:
            raise RuntimeError("Not connected")
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    "stockTicker", "startPrice", "endPrice",
                    "changePercent", sentiment, "newsEvents"
                FROM market_outcomes
                WHERE "windowId" = $1 AND "stockTicker" IS NOT NULL
                """,
                window_id
            )
        
        if not rows:
            return None
        
        # Parse window time
        window_start = datetime.fromisoformat(window_id.replace('Z', '+00:00'))
        window_end = window_start + timedelta(hours=1)
        
        stocks = {}
        for row in rows:
            stocks[row['stockTicker']] = StockOutcome(
                ticker=row['stockTicker'],
                start_price=float(row['startPrice']),
                end_price=float(row['endPrice']),
                change_percent=float(row['changePercent']),
                sentiment=row['sentiment'],
                news_events=row['newsEvents'] if row['newsEvents'] else []
            )
        
        return MarketOutcomes(
            window_id=window_id,
            window_start=window_start,
            window_end=window_end,
            stocks=stocks
        )
    
    async def get_window_stats(self, window_id: str) -> WindowStatistics | None:
        """Get statistics for window - validated"""
        if not self.pool:
            raise RuntimeError("Not connected")
        
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT 
                    "windowId",
                    COUNT(DISTINCT "agentId") as agent_count,
                    COUNT(*) as trajectory_count,
                    COALESCE(SUM("episodeLength"), 0) as total_actions,
                    COALESCE(AVG("finalPnL"), 0) as avg_pnl,
                    COALESCE(MIN("finalPnL"), 0) as min_pnl,
                    COALESCE(MAX("finalPnL"), 0) as max_pnl,
                    MIN("startTime") as start_time,
                    MAX("endTime") as end_time
                FROM trajectories
                WHERE "windowId" = $1
                GROUP BY "windowId"
                """,
                window_id
            )
        
        if not row:
            return None
        
        return WindowStatistics(
            window_id=row['windowId'],
            agent_count=row['agent_count'],
            trajectory_count=row['trajectory_count'],
            total_actions=row['total_actions'],
            avg_pnl=float(row['avg_pnl']),
            min_pnl=float(row['min_pnl']),
            max_pnl=float(row['max_pnl']),
            start_time=row['start_time'],
            end_time=row['end_time']
        )
    
    async def __aenter__(self):
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()



