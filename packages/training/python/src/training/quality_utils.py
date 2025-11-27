"""
Shared Quality Utilities

Common quality scoring and validation functions used across the training pipeline.
Extracted to avoid duplication between rollout_generator and fast_simulator.

ENHANCED v2:
- Archetype-specific scoring weights
- Reasoning-action alignment validation
- Coherence heuristics
- Curriculum learning support
"""

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Literal

from ..models import (
    BabylonTrajectory,
    TrajectoryStep,
    Action,
    EnvironmentState,
)

if TYPE_CHECKING:
    from .rollout_generator import AgentTickData

# Archetype-specific quality weights
ARCHETYPE_WEIGHTS: dict[str, dict[str, float]] = {
    # Research-heavy archetypes prioritize reasoning
    "researcher": {"llm_calls": 0.3, "reasoning": 0.45, "action": 0.15, "feedback": 0.1},
    "information-trader": {"llm_calls": 0.3, "reasoning": 0.4, "action": 0.2, "feedback": 0.1},
    "super-predictor": {"llm_calls": 0.3, "reasoning": 0.4, "action": 0.2, "feedback": 0.1},
    
    # Action-heavy archetypes prioritize execution
    "trader": {"llm_calls": 0.3, "reasoning": 0.2, "action": 0.4, "feedback": 0.1},
    "degen": {"llm_calls": 0.2, "reasoning": 0.15, "action": 0.55, "feedback": 0.1},
    "perps-trader": {"llm_calls": 0.25, "reasoning": 0.2, "action": 0.45, "feedback": 0.1},
    
    # Social archetypes prioritize engagement (response quality)
    "social-butterfly": {"llm_calls": 0.35, "reasoning": 0.25, "action": 0.25, "feedback": 0.15},
    "ass-kisser": {"llm_calls": 0.35, "reasoning": 0.3, "action": 0.2, "feedback": 0.15},
    "goody-twoshoes": {"llm_calls": 0.35, "reasoning": 0.3, "action": 0.2, "feedback": 0.15},
    
    # Deceptive archetypes prioritize reasoning (planning deception)
    "scammer": {"llm_calls": 0.25, "reasoning": 0.4, "action": 0.25, "feedback": 0.1},
    "liar": {"llm_calls": 0.25, "reasoning": 0.4, "action": 0.25, "feedback": 0.1},
    
    # Balanced
    "infosec": {"llm_calls": 0.3, "reasoning": 0.3, "action": 0.3, "feedback": 0.1},
    
    # Default
    "default": {"llm_calls": 0.4, "reasoning": 0.3, "action": 0.2, "feedback": 0.1},
}


def check_reasoning_action_alignment(
    reasoning_text: str,
    action: Action | None,
) -> float:
    """
    Check if reasoning aligns with action taken (0-1 score).
    
    Examples of misalignment:
    - Reasoning says "bearish" but action is "buy"
    - Reasoning says "wait" but action is "sell"
    """
    if not action or not reasoning_text:
        return 0.5  # Neutral if we can't check
    
    reasoning_lower = reasoning_text.lower()
    action_type = action.action_type.lower()
    
    # Sentiment indicators
    bullish_words = ["bullish", "buy", "long", "upward", "positive", "opportunity", "moon"]
    bearish_words = ["bearish", "sell", "short", "downward", "negative", "avoid", "dump"]
    wait_words = ["wait", "hold", "unclear", "uncertain", "need more data", "observing"]
    
    # Count sentiment
    bullish_score = sum(1 for w in bullish_words if w in reasoning_lower)
    bearish_score = sum(1 for w in bearish_words if w in reasoning_lower)
    wait_score = sum(1 for w in wait_words if w in reasoning_lower)
    
    # Check alignment
    if action_type in ["buy", "buy_prediction", "open_perp"]:
        if bullish_score > bearish_score:
            return 1.0  # Aligned
        elif bearish_score > bullish_score:
            return 0.2  # Misaligned
    elif action_type in ["sell", "sell_prediction", "close_perp"]:
        if bearish_score > bullish_score:
            return 1.0  # Aligned
        elif bullish_score > bearish_score:
            return 0.2  # Misaligned
    elif action_type == "wait":
        if wait_score > 0:
            return 1.0  # Aligned
    
    return 0.7  # Neutral/unclear


def check_reasoning_coherence(reasoning_text: str) -> float:
    """
    Check reasoning coherence using simple heuristics (0-1 score).
    
    Checks for:
    - Has structured points (numbered lists, bullet points)
    - Has conclusion/decision markers
    - Reasonable sentence structure
    - No repetitive patterns
    """
    if not reasoning_text or len(reasoning_text) < 20:
        return 0.1
    
    score = 0.0
    text = reasoning_text
    
    # Check for structure (numbered lists, bullet points)
    if re.search(r'(\d+[\.\):]|\-|\*|\•)', text):
        score += 0.25
    
    # Check for conclusion markers
    conclusion_markers = [
        "therefore", "conclusion", "decision", "recommend",
        "suggest", "final", "result", "action:", "execute"
    ]
    if any(marker in text.lower() for marker in conclusion_markers):
        score += 0.25
    
    # Check sentence count (2-10 sentences is ideal)
    sentences = text.split('. ')
    if 2 <= len(sentences) <= 10:
        score += 0.2
    elif len(sentences) > 10:
        score += 0.1  # Too verbose
    
    # Check for repetitive patterns (bad quality indicator)
    words = text.lower().split()
    if len(words) > 10:
        unique_ratio = len(set(words)) / len(words)
        if unique_ratio > 0.4:
            score += 0.15  # Good vocabulary diversity
        else:
            score -= 0.1  # Repetitive
    else:
        score += 0.1
    
    # Check for numeric analysis (prices, percentages)
    if re.search(r'\$?\d+(?:\.\d+)?(?:%|k|K|M)?', text):
        score += 0.15  # Contains quantitative analysis
    
    return min(max(score, 0.0), 1.0)


def calculate_tick_quality_score(
    llm_calls: list,
    action: Action | None,
    feedback: dict | None,
    archetype: str | None = None,
) -> float:
    """
    Calculate quality score for a single tick (0-1).
    
    ENHANCED scoring:
    - Archetype-specific weights
    - Reasoning coherence checks
    - Reasoning-action alignment
    
    Args:
        llm_calls: List of LLM calls in this tick
        action: Action taken (if any)
        feedback: Feedback received (if any)
        archetype: Agent archetype for weight customization
    
    Returns:
        Quality score from 0.0 to 1.0
    """
    # Get archetype-specific weights
    weights = ARCHETYPE_WEIGHTS.get(archetype or "default", ARCHETYPE_WEIGHTS["default"])
    
    score = 0.0
    
    # LLM calls score
    if llm_calls:
        # Ideal: 2-4 calls depending on archetype
        ideal_calls = 3 if archetype in ["researcher", "information-trader"] else 2
        call_score = min(len(llm_calls) / ideal_calls, 1.0)
        score += call_score * weights["llm_calls"]
    
    # Reasoning quality (coherence + length)
    reasoning_texts = []
    for call in llm_calls:
        if call.reasoning:
            reasoning_texts.append(call.reasoning)
        if call.response:
            reasoning_texts.append(call.response)
    if action and action.reasoning:
        reasoning_texts.append(action.reasoning)
    
    full_reasoning = " ".join(reasoning_texts)
    
    if full_reasoning:
        # Length score (up to 500 chars)
        length_score = min(len(full_reasoning) / 500.0, 1.0)
        
        # Coherence score
        coherence_score = check_reasoning_coherence(full_reasoning)
        
        # Alignment score
        alignment_score = check_reasoning_action_alignment(full_reasoning, action)
        
        # Combined reasoning score
        reasoning_score = (length_score * 0.4) + (coherence_score * 0.35) + (alignment_score * 0.25)
        score += reasoning_score * weights["reasoning"]
    
    # Action quality
    if action:
        action_score = 0.0
        if action.success:
            action_score = 1.0
        elif action.error:
            action_score = 0.25
        else:
            action_score = 0.5  # Unknown outcome
        score += action_score * weights["action"]
    
    # Feedback presence
    if feedback:
        score += weights["feedback"]
    
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

