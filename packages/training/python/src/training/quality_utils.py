"""
Shared Quality Utilities

Common quality scoring and validation functions used across the training pipeline.
Extracted to avoid duplication between rollout_generator and fast_simulator.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from ..models import (
    BabylonTrajectory,
    TrajectoryStep,
    Action,
    EnvironmentState,
)

if TYPE_CHECKING:
    from .rollout_generator import AgentTickData


def calculate_tick_quality_score(
    llm_calls: list,
    action: Action | None,
    feedback: dict | None,
) -> float:
    """
    Calculate quality score for a single tick (0-1).
    
    Scoring breakdown:
    - LLM call coverage: 0.4 weight (1-3 calls = proportional score)
    - Reasoning completeness: 0.3 weight (up to 500 chars)
    - Action quality: 0.2 weight (success/failure)
    - Feedback presence: 0.1 weight
    """
    score = 0.0
    
    # LLM calls (0.4 weight)
    if llm_calls:
        call_score = min(len(llm_calls) / 3.0, 1.0)
        score += call_score * 0.4
    
    # Reasoning completeness (0.3 weight)
    reasoning_len = sum(len(c.reasoning or "") for c in llm_calls)
    if action and action.reasoning:
        reasoning_len += len(action.reasoning)
    reasoning_score = min(reasoning_len / 500.0, 1.0)
    score += reasoning_score * 0.3
    
    # Action quality (0.2 weight)
    if action:
        if action.success:
            score += 0.2
        elif action.error:
            score += 0.05
        else:
            score += 0.1
    
    # Feedback presence (0.1 weight)
    if feedback:
        score += 0.1
    
    return score


def calculate_trajectory_quality_score(ticks: list["AgentTickData"]) -> float:
    """Calculate overall quality score for a trajectory (0-1)"""
    if not ticks:
        return 0.0
    
    scores = [
        calculate_tick_quality_score(
            tick.llm_calls,
            tick.action,
            tick.feedback,
        )
        for tick in ticks
    ]
    
    return sum(scores) / len(scores)


def build_trajectory_from_ticks(
    trajectory_id: str,
    agent_id: str,
    ticks: list["AgentTickData"],
    min_steps: int = 1,
) -> BabylonTrajectory | None:
    """
    Build a BabylonTrajectory from tick data.
    
    Args:
        trajectory_id: Unique trajectory ID
        agent_id: Agent ID
        ticks: List of AgentTickData
        min_steps: Minimum steps required (returns None if fewer)
        
    Returns:
        BabylonTrajectory or None if insufficient data
    """
    if len(ticks) < min_steps:
        return None
    
    steps = []
    for tick in ticks:
        step = TrajectoryStep(
            step_number=tick.tick_number,
            timestamp=tick.timestamp,
            environment_state=tick.environment_state,
            provider_accesses=[],
            llm_calls=tick.llm_calls,
            action=tick.action or Action(
                action_type="wait",
                parameters={},
                success=True,
            ),
            reward=tick.reward,
        )
        steps.append(step)
    
    # Calculate final metrics
    final_pnl = ticks[-1].environment_state.agent_pnl if ticks else 0.0
    final_balance = ticks[-1].environment_state.agent_balance if ticks else 10000.0
    total_reward = sum(t.reward for t in ticks)
    
    # Count trades and posts
    trades_executed = sum(
        1 for t in ticks
        if t.action and t.action.action_type in [
            "buy", "sell", "buy_prediction", "sell_prediction",
            "open_perp", "close_perp"
        ]
    )
    posts_created = sum(
        1 for t in ticks
        if t.action and t.action.action_type in ["create_post", "post"]
    )
    
    now = datetime.now(timezone.utc)
    
    return BabylonTrajectory(
        id=trajectory_id,
        trajectory_id=trajectory_id,
        agent_id=agent_id,
        window_id=now.strftime("%Y-%m-%dT%H:00"),
        start_time=datetime.fromtimestamp(ticks[0].timestamp / 1000, tz=timezone.utc),
        end_time=datetime.fromtimestamp(ticks[-1].timestamp / 1000, tz=timezone.utc),
        duration_ms=ticks[-1].timestamp - ticks[0].timestamp,
        steps=steps,
        total_reward=total_reward,
        final_pnl=final_pnl,
        final_balance=final_balance,
        trades_executed=trades_executed,
        posts_created=posts_created,
        episode_length=len(steps),
        final_status="completed",
    )


def state_to_observation(game_state: dict) -> dict:
    """Convert game state to agent observation"""
    return {
        "tick": game_state.get("tick", 0),
        "time": game_state.get("currentTime", 0),
        "markets": game_state.get("predictionMarkets", []),
        "perpetuals": game_state.get("perpetualMarkets", []),
        "news": game_state.get("news", [])[:5],  # Limit for speed
        "posts": game_state.get("socialFeed", [])[:10],
    }


def state_to_env_state(game_state: dict, agent_id: str) -> EnvironmentState:
    """Extract environment state for an agent from game state"""
    # Find agent's portfolio
    portfolio = {}
    for p in game_state.get("portfolios", []):
        if p.get("agentId") == agent_id:
            portfolio = p
            break
    
    return EnvironmentState(
        agent_balance=portfolio.get("balance", 10000.0),
        agent_pnl=portfolio.get("pnl", 0.0),
        open_positions=portfolio.get("positionCount", portfolio.get("positions", 0)),
        active_markets=len(game_state.get("predictionMarkets", [])),
    )


@dataclass
class ValidationResult:
    """Result of rollout validation"""
    is_valid: bool
    issues: list[str]
    quality_score: float
    
    @property
    def issue_count(self) -> int:
        return len(self.issues)


def validate_trajectory_quality(
    ticks: list["AgentTickData"],
    min_ticks: int = 5,
    min_llm_calls_per_tick: float = 0.8,  # 80% of ticks should have LLM calls
    min_quality_score: float = 0.5,
) -> ValidationResult:
    """
    Validate trajectory meets quality requirements for training.
    
    Args:
        ticks: List of tick data
        min_ticks: Minimum number of ticks required
        min_llm_calls_per_tick: Minimum fraction of ticks with LLM calls
        min_quality_score: Minimum quality score threshold
        
    Returns:
        ValidationResult with validity, issues, and score
    """
    issues: list[str] = []
    
    # Check tick count
    if len(ticks) < min_ticks:
        issues.append(f"Too few ticks: {len(ticks)} < {min_ticks}")
    
    if not ticks:
        return ValidationResult(is_valid=False, issues=issues, quality_score=0.0)
    
    # Check LLM call coverage
    ticks_with_calls = sum(1 for t in ticks if t.llm_calls)
    call_coverage = ticks_with_calls / len(ticks)
    if call_coverage < min_llm_calls_per_tick:
        issues.append(f"Low LLM call coverage: {call_coverage:.1%} < {min_llm_calls_per_tick:.1%}")
    
    # Check for empty LLM calls
    empty_calls = 0
    for tick in ticks:
        for call in tick.llm_calls:
            if not call.user_prompt or not call.response:
                empty_calls += 1
    
    if empty_calls > 0:
        issues.append(f"{empty_calls} LLM calls with empty prompt/response")
    
    # Calculate quality score
    quality_score = calculate_trajectory_quality_score(ticks)
    
    if quality_score < min_quality_score:
        issues.append(f"Quality score too low: {quality_score:.2f} < {min_quality_score}")
    
    return ValidationResult(
        is_valid=len(issues) == 0,
        issues=issues,
        quality_score=quality_score,
    )

