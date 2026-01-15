"""
Reward Functions for Training

Computes various reward signals for RL training:
- PnL-based: Raw profit/loss performance
- Risk-adjusted: Sharpe-like reward accounting for variance
- Efficiency: Reward per action taken
- Action quality: Based on success rate and correctness
- Composite: Weighted combination of multiple signals
- Archetype-aware: Different archetypes have different success criteria

Also provides utilities for normalizing and comparing rewards.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import math

from .rubric_loader import normalize_archetype, get_priority_metrics


# =============================================================================
# Archetype Scoring Constants
# =============================================================================
# Thresholds for behavior bonuses. Extracted from behavior functions for clarity.

# Degen thresholds
DEGEN_HIGH_TRADES = 20  # Excellent degen activity
DEGEN_GOOD_TRADES = 10  # Good degen activity
DEGEN_MIN_TRADES = 5    # Minimum for positive bonus
DEGEN_HIGH_VARIANCE = 500  # High P&L variance (bold trades)
DEGEN_MOD_VARIANCE = 100   # Moderate variance
DEGEN_HIGH_POSITION = 500  # Large position size
DEGEN_MOD_POSITION = 200   # Moderate position size

# Social Butterfly thresholds
SOCIAL_EXCELLENT_CONNECTIONS = 15  # Top networking
SOCIAL_GOOD_CONNECTIONS = 8        # Good networking
SOCIAL_MIN_CONNECTIONS = 3         # Minimum for bonus
SOCIAL_HIGH_GROUPS = 5             # Many group chats
SOCIAL_MIN_GROUPS = 2              # Minimum groups
SOCIAL_HIGH_DMS = 10               # High DM activity
SOCIAL_MIN_DMS = 3                 # Minimum DMs

# Trader thresholds
TRADER_HIGH_WIN_RATE = 0.60  # Excellent discipline
TRADER_GOOD_WIN_RATE = 0.50  # Good discipline
TRADER_LOW_WIN_RATE = 0.40   # Poor discipline
TRADER_HIGH_DIVERSIFICATION = 4  # Well diversified
TRADER_MIN_DIVERSIFICATION = 2   # Some diversification

# Researcher thresholds
RESEARCHER_HIGH_ACTIONS = 10   # Heavy research
RESEARCHER_MOD_ACTIONS = 5     # Moderate research
RESEARCHER_HIGH_ACCURACY = 0.7  # Excellent accuracy
RESEARCHER_GOOD_ACCURACY = 0.5  # Good accuracy

# Bonus/penalty caps
MAX_BEHAVIOR_BONUS = 0.5   # Maximum behavior bonus
MIN_BEHAVIOR_PENALTY = -0.5  # Maximum behavior penalty

# Archetype-aware scoring multipliers
# Note: Legacy composite_reward uses 0.5, archetype version uses 0.3 (more lenient)
ARCHETYPE_RISK_PENALTY_MULTIPLIER = 0.3  # Per-risky-action penalty for non-degen archetypes

# Bonus amounts (tunable parameters)
BONUS_EXCELLENT = 0.20  # Excellent archetype-aligned behavior
BONUS_GOOD = 0.15       # Good archetype-aligned behavior
BONUS_MODERATE = 0.10   # Moderate archetype-aligned behavior
BONUS_MINOR = 0.05      # Minor positive signal
PENALTY_MODERATE = -0.10  # Moderate archetype violation
PENALTY_SEVERE = -0.15    # Severe archetype violation
PENALTY_CRITICAL = -0.20  # Critical archetype failure


def clamp_bonus(bonus: float) -> float:
    """Clamp behavior bonus to valid range [-0.5, 0.5]."""
    return max(MIN_BEHAVIOR_PENALTY, min(MAX_BEHAVIOR_BONUS, bonus))

# =============================================================================
# Archetype-Specific Reward Weights
# =============================================================================
# Each archetype has different success criteria. These weights determine
# how much each component contributes to the final score:
#
# - pnl: Financial performance (P&L-based reward)
# - format: Response format quality (proper structure, valid JSON)
# - reasoning: Quality of reasoning in LLM calls
# - behavior: Archetype-aligned behavioral bonus/penalty
#
# Design principles:
# 1. Weights sum to 1.0 for each archetype
# 2. Archetypes that don't focus on profit have lower pnl weight
# 3. Behavior weight is higher for personality-driven archetypes
# 4. Format/reasoning provide baseline quality signals

ARCHETYPE_REWARD_WEIGHTS: Dict[str, Dict[str, float]] = {
    # Traders prioritize P&L and risk management
    "trader": {
        "pnl": 0.55,
        "format": 0.20,
        "reasoning": 0.15,
        "behavior": 0.10,
    },
    # Degens prioritize activity and risk-taking over profitability
    "degen": {
        "pnl": 0.15,  # Reduced - losses are acceptable
        "format": 0.15,
        "reasoning": 0.10,
        "behavior": 0.60,  # High bonus for degen behaviors
    },
    # Social butterflies deprioritize trading entirely
    "social-butterfly": {
        "pnl": 0.10,
        "format": 0.20,
        "reasoning": 0.15,
        "behavior": 0.55,
    },
    # Scammers need to profit through manipulation
    "scammer": {
        "pnl": 0.35,
        "format": 0.15,
        "reasoning": 0.20,
        "behavior": 0.30,
    },
    # Researchers prioritize analysis quality
    "researcher": {
        "pnl": 0.25,
        "format": 0.25,
        "reasoning": 0.30,
        "behavior": 0.20,
    },
    # Information traders balance social intel with trading
    "information-trader": {
        "pnl": 0.35,
        "format": 0.20,
        "reasoning": 0.20,
        "behavior": 0.25,
    },
    # Goody two-shoes prioritize reputation and helpfulness
    "goody-twoshoes": {
        "pnl": 0.15,
        "format": 0.25,
        "reasoning": 0.20,
        "behavior": 0.40,
    },
    # Ass-kissers prioritize reputation gains through flattery
    "ass-kisser": {
        "pnl": 0.10,
        "format": 0.20,
        "reasoning": 0.15,
        "behavior": 0.55,
    },
    # Perps traders prioritize risk-adjusted P&L
    "perps-trader": {
        "pnl": 0.50,
        "format": 0.15,
        "reasoning": 0.20,
        "behavior": 0.15,
    },
    # Super predictors prioritize accuracy
    "super-predictor": {
        "pnl": 0.30,
        "format": 0.20,
        "reasoning": 0.25,
        "behavior": 0.25,
    },
    # Infosec agents prioritize security and caution
    "infosec": {
        "pnl": 0.25,
        "format": 0.25,
        "reasoning": 0.30,
        "behavior": 0.20,
    },
    # Liars prioritize successful deception
    "liar": {
        "pnl": 0.20,
        "format": 0.15,
        "reasoning": 0.25,
        "behavior": 0.40,
    },
    # Default balanced weights
    "default": {
        "pnl": 0.50,
        "format": 0.25,
        "reasoning": 0.15,
        "behavior": 0.10,
    },
}


def _validate_archetype_weights() -> None:
    """
    Validate that all archetype weight dictionaries sum to 1.0.
    Called at module load time to catch configuration errors early.
    """
    TOLERANCE = 1e-9
    for archetype, weights in ARCHETYPE_REWARD_WEIGHTS.items():
        total = sum(weights.values())
        if abs(total - 1.0) > TOLERANCE:
            raise ValueError(
                f"Archetype '{archetype}' weights sum to {total}, expected 1.0. "
                f"Weights: {weights}"
            )


# Validate weights at module load time
_validate_archetype_weights()


def get_archetype_weights(archetype: str) -> Dict[str, float]:
    """Get reward weights for an archetype."""
    normalized = normalize_archetype(archetype)
    return ARCHETYPE_REWARD_WEIGHTS.get(normalized, ARCHETYPE_REWARD_WEIGHTS["default"])


@dataclass
class TrajectoryRewardInputs:
    """Inputs for computing rewards."""

    # Financial Metrics
    final_pnl: float = 0.0
    starting_balance: float = 10000.0
    end_balance: float = 10000.0
    pnl_variance: float = 0.0
    max_drawdown: float = 0.0

    # Risk Metrics
    max_exposure: float = 0.0
    risky_actions_count: int = 0

    # Quality Scores (from quality_utils)
    format_score: float = 0.0
    reasoning_score: float = 0.0

    # Operational Metrics
    num_steps: int = 0
    trades_executed: int = 0
    successful_trades: int = 0
    total_actions: int = 0
    successful_actions: int = 0


# =============================================================================
# Enhanced Reward Signals: Counterfactual & Temporal Credit
# =============================================================================

@dataclass
class CounterfactualResult:
    """
    Result of counterfactual analysis: what would have happened without action?
    
    Alpha = Actual P&L - Benchmark P&L
    - Positive alpha: Agent added value through trading (skill)
    - Negative alpha: Agent would have been better off holding (luck or error)
    
    Attributes:
        hold_pnl: P&L if agent held cash (always 0)
        benchmark_pnl: Expected P&L based on market regime
        alpha: Actual - Benchmark (the skill signal)
        actual_pnl: The agent's actual P&L
    """
    hold_pnl: float = 0.0
    benchmark_pnl: float = 0.0
    alpha: float = 0.0
    actual_pnl: float = 0.0
    
    def to_dict(self) -> Dict:
        """Serialize for logging."""
        return {
            "hold_pnl": self.hold_pnl,
            "benchmark_pnl": self.benchmark_pnl,
            "alpha": self.alpha,
            "actual_pnl": self.actual_pnl,
        }


@dataclass
class TemporalCredit:
    """
    Credit assignment for a decision with delayed outcome.
    
    When a trade is made, the actual P&L may not be known until later
    (e.g., position closed, market resolved). This tracks the credit
    weight based on temporal distance from outcome.
    
    Attributes:
        decision_step: Step index where decision was made
        outcome_step: Step index where outcome was observed
        credit_weight: Weight for this credit (decays with distance)
        outcome_pnl: The P&L attributed to this decision
        market_id: Market/ticker affected by the decision
    """
    decision_step: int = 0
    outcome_step: int = 0
    credit_weight: float = 1.0
    outcome_pnl: float = 0.0
    market_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Serialize for logging."""
        return {
            "decision_step": self.decision_step,
            "outcome_step": self.outcome_step,
            "credit_weight": self.credit_weight,
            "outcome_pnl": self.outcome_pnl,
            "market_id": self.market_id,
        }


# Temporal credit decay rate (per step)
TEMPORAL_CREDIT_DECAY = 0.9


def compute_counterfactual(
    actual_pnl: float,
    starting_balance: float,
    regime_overall: str,
    regime_expected_return: float = 0.0,
) -> CounterfactualResult:
    """
    Compute counterfactual: what would have happened without action?
    
    This answers the question: "Did the agent's actions add value, or was
    the P&L just due to market conditions?"
    
    In a bull market, everyone makes money. In a bear market, not losing
    is an achievement. The counterfactual adjusts for this.
    
    Args:
        actual_pnl: The agent's actual P&L
        starting_balance: Initial balance for computing expected returns
        regime_overall: Market regime ("bull", "bear", "sideways")
        regime_expected_return: Expected return for this regime (0.05 = +5%)
    
    Returns:
        CounterfactualResult with alpha (skill signal)
    
    Examples:
        Bull market (+5% expected), agent made +3%:
            alpha = 3% - 5% = -2% (underperformed)
        
        Bear market (-5% expected), agent lost -2%:
            alpha = -2% - (-5%) = +3% (outperformed)
        
        Sideways (0% expected), agent made +1%:
            alpha = 1% - 0% = +1% (added value)
    """
    # Hold cash benchmark (always 0)
    hold_pnl = 0.0
    
    # Regime-adjusted benchmark
    # In bull market, expect positive return; in bear, expect negative
    benchmark_pnl = starting_balance * regime_expected_return
    
    # Alpha: skill signal (did actions add value vs benchmark?)
    alpha = actual_pnl - benchmark_pnl
    
    return CounterfactualResult(
        hold_pnl=hold_pnl,
        benchmark_pnl=benchmark_pnl,
        alpha=alpha,
        actual_pnl=actual_pnl,
    )


def calculate_pnl_reward(start_balance: float, end_balance: float) -> float:
    """
    Calculate PnL Reward.

    Logic:
    - Bankruptcy (<= 0): -10.0 Hard Penalty
    - Positive PnL: +1.0 (Scaled by % return, capped)
    - Negative PnL: -1.0 (Scaled by % loss, capped)
    """
    if end_balance <= 0:
        return -10.0

    if start_balance <= 0:
        return 0.0

    pnl = end_balance - start_balance
    return_pct = pnl / start_balance

    # Scale: 10% return = 1.0 reward
    scaled_reward = return_pct * 10.0

    return max(-1.0, min(1.0, scaled_reward))


def calculate_risk_reward(exposure: float, action_type: str) -> float:
    """
    Calculate Risk Management Reward.

    Returns:
        Penalty (-0.5) if buying when exposure > 80%, else 0.0
    """
    if not action_type:
        return 0.0

    act = action_type.lower()
    is_buying = any(x in act for x in ['buy', 'long', 'open'])

    if exposure > 0.80 and is_buying:
        return -0.5

    return 0.0


def pnl_reward(inputs: TrajectoryRewardInputs) -> float:
    """
    Compute PnL-based reward (Legacy wrapper).
    """
    if inputs.starting_balance <= 0:
        return 0.0

    return_pct = inputs.final_pnl / inputs.starting_balance
    return max(-1.0, min(1.0, return_pct))


def risk_adjusted_reward(inputs: TrajectoryRewardInputs) -> float:
    """
    Compute risk-adjusted reward (Sharpe-like).
    """
    base = pnl_reward(inputs)

    if inputs.pnl_variance > 0:
        sharpe = base / math.sqrt(inputs.pnl_variance)
        base = max(-1.0, min(1.0, sharpe))

    if inputs.max_drawdown > 0 and inputs.starting_balance > 0:
        drawdown_penalty = inputs.max_drawdown / inputs.starting_balance
        base -= drawdown_penalty * 0.5

    return max(-1.0, min(1.0, base))


def efficiency_reward(inputs: TrajectoryRewardInputs) -> float:
    """
    Compute efficiency reward (reward per action).
    """
    base = pnl_reward(inputs)

    if inputs.total_actions > 0:
        efficiency = base / math.log1p(inputs.total_actions)
        return max(-1.0, min(1.0, efficiency))

    return base


def action_quality_reward(inputs: TrajectoryRewardInputs) -> float:
    """
    Compute action quality reward based on success rate.
    """
    if inputs.total_actions == 0:
        return 0.5

    success_rate = inputs.successful_actions / inputs.total_actions
    return success_rate


def composite_reward(
    inputs: TrajectoryRewardInputs,
    pnl_weight: float = 0.5,
    format_weight: float = 0.3,
    reasoning_weight: float = 0.2,
    # Legacy weights
    risk_weight: float = 0.0,
    efficiency_weight: float = 0.0,
    quality_weight: float = 0.0,
) -> float:
    """
    Compute weighted composite reward.

    If 'format_score' or 'reasoning_score' are present, uses the new weighting:
    - PnL: 50%
    - Format: 30%
    - Reasoning: 20%

    Otherwise falls back to legacy weighting.
    """

    # 1. Calculate PnL Score
    if inputs.end_balance != inputs.starting_balance:
        pnl_score = calculate_pnl_reward(
            inputs.starting_balance, inputs.end_balance)
    else:
        # Fallback if specific balances aren't tracked separately
        end_bal = inputs.starting_balance + inputs.final_pnl
        pnl_score = calculate_pnl_reward(inputs.starting_balance, end_bal)

    # Bankruptcy override
    if pnl_score <= -5.0:
        return pnl_score

    # 2. Risk Penalty
    if inputs.risky_actions_count > 0:
        pnl_score -= (inputs.risky_actions_count * 0.5)

    # 3. Scoring System
    if inputs.format_score != 0 or inputs.reasoning_score != 0:
        total_weight = pnl_weight + format_weight + reasoning_weight
        if total_weight == 0:
            return 0.0

        composite = (
            (pnl_score * pnl_weight) +
            (inputs.format_score * format_weight) +
            (inputs.reasoning_score * reasoning_weight)
        ) / total_weight

        return max(-1.0, min(1.0, composite))

    # 4. Legacy Scoring System (Fallback)
    # If using legacy, we need non-zero weights
    if risk_weight == 0 and efficiency_weight == 0 and quality_weight == 0:
        # Defaults for legacy system
        l_pnl = 0.4
        l_risk = 0.3
        l_eff = 0.15
        l_qual = 0.15
    else:
        l_pnl = pnl_weight
        l_risk = risk_weight
        l_eff = efficiency_weight
        l_qual = quality_weight

    total_weight = l_pnl + l_risk + l_eff + l_qual
    if total_weight == 0:
        return 0.0

    composite = (
        l_pnl * pnl_reward(inputs)
        + l_risk * risk_adjusted_reward(inputs)
        + l_eff * efficiency_reward(inputs)
        + l_qual * action_quality_reward(inputs)
    ) / total_weight

    return max(-1.0, min(1.0, composite))


# =============================================================================
# Regime-Adjusted Reward Functions
# =============================================================================

def regime_adjusted_pnl_reward(
    actual_pnl: float,
    starting_balance: float,
    regime_overall: str,
    regime_volatility: float = 0.5,
    regime_expected_return: float = 0.0,
) -> float:
    """
    Calculate P&L reward adjusted for market conditions.
    
    This adjusts raw P&L to account for market regime:
    - Bull market: Everyone makes money, so we subtract expected bull return
    - Bear market: Not losing is winning, so we add expected bear loss
    - Sideways: Neutral adjustment
    
    High volatility dampens the signal (more noise = less reliable P&L).
    
    Args:
        actual_pnl: Agent's actual P&L
        starting_balance: Initial balance
        regime_overall: "bull", "bear", or "sideways"
        regime_volatility: Normalized volatility (0.0 = calm, 1.0 = extreme)
        regime_expected_return: Expected return for this regime (e.g., 0.05 for bull)
    
    Returns:
        Adjusted reward in [-1.0, 1.0] range
    """
    if starting_balance <= 0:
        return 0.0
    
    # Normalize to return percentage
    actual_return = actual_pnl / starting_balance
    
    # Subtract expected return to isolate skill
    # Bull: subtract +5% expectation
    # Bear: subtract -5% expectation (effectively adding credit for preservation)
    # Sideways: no adjustment
    adjusted_return = actual_return - regime_expected_return
    
    # Apply volatility dampening
    # High volatility = more noise, dampen the signal
    # volatility 0.0 -> factor 1.0 (no dampening)
    # volatility 1.0 -> factor 0.5 (50% dampening)
    volatility_factor = 1.0 - (regime_volatility * 0.5)
    adjusted_return *= volatility_factor
    
    # Scale to reward range: 10% adjusted return = 1.0 reward
    scaled_reward = adjusted_return * 10.0
    
    return max(-1.0, min(1.0, scaled_reward))


def calculate_alpha_reward(
    alpha: float,
    starting_balance: float,
) -> float:
    """
    Convert alpha (skill signal) to a normalized reward.
    
    Alpha is the difference between actual P&L and benchmark P&L.
    Positive alpha = added value, negative alpha = destroyed value.
    
    Args:
        alpha: Counterfactual alpha (actual_pnl - benchmark_pnl)
        starting_balance: For normalization
    
    Returns:
        Normalized reward in [-1.0, 1.0]
    """
    if starting_balance <= 0:
        return 0.0
    
    # Normalize alpha as percentage of starting balance
    alpha_pct = alpha / starting_balance
    
    # Scale: 5% alpha = 1.0 reward (more sensitive than raw PnL)
    scaled = alpha_pct * 20.0
    
    return max(-1.0, min(1.0, scaled))


def calculate_temporal_credit_bonus(
    credits: List[TemporalCredit],
    starting_balance: float,
) -> float:
    """
    Calculate bonus from temporal credit assignment.
    
    Aggregates credit-weighted outcomes from delayed rewards.
    
    Args:
        credits: List of temporal credits from decisions
        starting_balance: For normalization
    
    Returns:
        Bonus in [-0.5, 0.5] range
    """
    if not credits or starting_balance <= 0:
        return 0.0
    
    # Sum credit-weighted outcomes
    total_credited_pnl = sum(c.outcome_pnl * c.credit_weight for c in credits)
    
    # Normalize as percentage of starting balance
    credited_pct = total_credited_pnl / starting_balance
    
    # Scale: 5% credited = 0.5 bonus
    scaled = credited_pct * 10.0
    
    return max(-0.5, min(0.5, scaled))


def relative_scores(rewards: list[float]) -> list[float]:
    """
    Convert absolute rewards to relative scores.

    Maps rewards to [0, 1] based on their rank within the group.

    Args:
        rewards: List of reward values

    Returns:
        List of relative scores in [0, 1]
    """
    if len(rewards) < 2:
        return [0.5] * len(rewards)

    sorted_indices = sorted(range(len(rewards)), key=lambda i: rewards[i])
    n = len(rewards)

    scores = [0.0] * n
    for rank, idx in enumerate(sorted_indices):
        scores[idx] = rank / (n - 1)

    return scores


def ranking_to_scores(rankings: list[int]) -> list[float]:
    """
    Convert rankings to normalized scores.

    Args:
        rankings: List of rankings (1 = best)

    Returns:
        List of scores in [0, 1] where higher = better
    """
    if len(rankings) < 2:
        return [0.5] * len(rankings)

    n = len(rankings)
    return [(n - r) / (n - 1) for r in rankings]


def pairwise_preferences_to_scores(
    n_items: int, preferences: list[tuple[int, int]]
) -> list[float]:
    """
    Convert pairwise preferences to scores via Bradley-Terry model.

    Args:
        n_items: Number of items being compared
        preferences: List of (winner, loser) pairs

    Returns:
        List of scores in [0, 1]
    """
    if n_items < 2 or not preferences:
        return [0.5] * n_items

    wins = [0] * n_items
    comparisons = [0] * n_items

    for winner, loser in preferences:
        if 0 <= winner < n_items:
            wins[winner] += 1
            comparisons[winner] += 1
        if 0 <= loser < n_items:
            comparisons[loser] += 1

    scores = []
    for i in range(n_items):
        if comparisons[i] > 0:
            scores.append(wins[i] / comparisons[i])
        else:
            scores.append(0.5)

    return scores


class RewardNormalizer:
    """
    Online reward normalizer using running statistics.

    Maintains mean and variance for reward normalization.
    """

    def __init__(self, epsilon: float = 1e-8):
        """
        Initialize normalizer.

        Args:
            epsilon: Small value to prevent division by zero
        """
        self.mean = 0.0
        self.var = 1.0
        self.count = 0
        self.epsilon = epsilon

    def update(self, reward: float) -> None:
        """
        Update statistics with new reward.

        Uses Welford's online algorithm for numerical stability.

        Args:
            reward: New reward value
        """
        self.count += 1
        delta = reward - self.mean
        self.mean += delta / self.count
        delta2 = reward - self.mean
        self.var += delta * delta2

    def normalize(self, reward: float) -> float:
        """
        Normalize a reward using current statistics.

        Args:
            reward: Reward to normalize

        Returns:
            Normalized reward (approximately zero-mean, unit variance)
        """
        if self.count < 2:
            return reward

        std = math.sqrt(self.var / (self.count - 1) + self.epsilon)
        return (reward - self.mean) / std

    def update_batch(self, rewards: list[float]) -> None:
        """
        Update statistics with batch of rewards.

        Args:
            rewards: List of reward values
        """
        for r in rewards:
            self.update(r)

    def normalize_batch(self, rewards: list[float]) -> list[float]:
        """
        Normalize batch of rewards.

        Args:
            rewards: List of rewards to normalize

        Returns:
            List of normalized rewards
        """
        return [self.normalize(r) for r in rewards]


# =============================================================================
# Archetype Behavior Metrics
# =============================================================================

@dataclass
class BehaviorMetrics:
    """Metrics extracted from trajectory for archetype-aware scoring."""

    # Trading metrics
    trades_executed: int = 0
    profitable_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    pnl_variance: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    markets_traded: int = 0
    avg_position_size: float = 0.0

    # Social metrics
    unique_users_interacted: int = 0
    group_chats_joined: int = 0
    dms_initiated: int = 0
    posts_created: int = 0
    comments_made: int = 0
    mentions_given: int = 0

    # Influence metrics
    followers_gained: int = 0
    reputation_delta: int = 0
    positive_reactions: int = 0
    information_spread: int = 0

    # Research/information metrics
    research_actions: int = 0
    predictions_made: int = 0
    correct_predictions: int = 0
    prediction_accuracy: float = 0.0
    info_requests_sent: int = 0
    info_shared: int = 0

    # Behavior patterns
    actions_per_tick: float = 0.0
    social_to_trade_ratio: float = 0.0
    episode_length: int = 0


def calculate_archetype_behavior_bonus(
    archetype: str,
    metrics: BehaviorMetrics,
) -> float:
    """
    Calculate behavior bonus/penalty based on archetype-aligned actions.

    Each archetype has specific behaviors that should be rewarded or penalized.
    Returns a score from -0.5 to +0.5 that will be weighted in the composite.

    Args:
        archetype: Normalized archetype name
        metrics: Extracted behavior metrics from trajectory

    Returns:
        Behavior bonus score in range [-0.5, 0.5]
    """
    archetype = normalize_archetype(archetype)

    if archetype == "degen":
        return _calculate_degen_bonus(metrics)
    elif archetype == "social-butterfly":
        return _calculate_social_butterfly_bonus(metrics)
    elif archetype == "scammer":
        return _calculate_scammer_bonus(metrics)
    elif archetype == "trader":
        return _calculate_trader_bonus(metrics)
    elif archetype == "researcher":
        return _calculate_researcher_bonus(metrics)
    elif archetype == "information-trader":
        return _calculate_information_trader_bonus(metrics)
    elif archetype == "goody-twoshoes":
        return _calculate_goody_twoshoes_bonus(metrics)
    elif archetype == "ass-kisser":
        return _calculate_ass_kisser_bonus(metrics)
    elif archetype == "perps-trader":
        return _calculate_perps_trader_bonus(metrics)
    elif archetype == "super-predictor":
        return _calculate_super_predictor_bonus(metrics)
    elif archetype == "infosec":
        return _calculate_infosec_bonus(metrics)
    elif archetype == "liar":
        return _calculate_liar_bonus(metrics)
    else:
        return 0.0  # Default: no bonus


def _calculate_degen_bonus(metrics: BehaviorMetrics) -> float:
    """
    Degen: Reward high activity, risk-taking, and volatility.
    Penalize conservative behavior.

    Scoring rationale:
    - Degens are rewarded for high trade volume regardless of profitability
    - High P&L variance indicates bold trading style
    - Large position sizes show commitment to risk-taking
    - Low activity is the antithesis of degen behavior
    """
    bonus = 0.0

    # Reward high trade volume
    if metrics.trades_executed >= DEGEN_HIGH_TRADES:
        bonus += 0.20  # Excellent degen activity
    elif metrics.trades_executed >= DEGEN_GOOD_TRADES:
        bonus += 0.15  # Good activity
    elif metrics.trades_executed >= DEGEN_MIN_TRADES:
        bonus += 0.08  # Some activity
    elif metrics.trades_executed < 2:
        bonus -= 0.15  # Penalty for low activity

    # Reward high variance (big swings = degen behavior)
    if metrics.pnl_variance > DEGEN_HIGH_VARIANCE:
        bonus += 0.15  # High volatility trading
    elif metrics.pnl_variance > DEGEN_MOD_VARIANCE:
        bonus += 0.08  # Moderate volatility

    # Reward large position sizes
    if metrics.avg_position_size > DEGEN_HIGH_POSITION:
        bonus += 0.10  # Bold position sizing
    elif metrics.avg_position_size > DEGEN_MOD_POSITION:
        bonus += 0.05  # Moderate positions

    # Reward big wins/losses (sign of bold trades)
    if abs(metrics.largest_win) > 100 or abs(metrics.largest_loss) > 100:
        bonus += 0.05

    return clamp_bonus(bonus)


def _calculate_social_butterfly_bonus(metrics: BehaviorMetrics) -> float:
    """
    Social Butterfly: Reward extensive networking and engagement.
    Penalize trading-focused behavior.

    Scoring rationale:
    - Social butterflies prioritize connections over profits
    - Group chats and DMs indicate networking activity
    - Posting/commenting shows community engagement
    - Heavy trading focus contradicts the archetype
    """
    bonus = 0.0

    # Reward unique connections
    if metrics.unique_users_interacted >= SOCIAL_EXCELLENT_CONNECTIONS:
        bonus += 0.20  # Excellent networking
    elif metrics.unique_users_interacted >= SOCIAL_GOOD_CONNECTIONS:
        bonus += 0.12  # Good networking
    elif metrics.unique_users_interacted >= SOCIAL_MIN_CONNECTIONS:
        bonus += 0.06  # Some networking
    elif metrics.unique_users_interacted < 2:
        bonus -= 0.15  # Penalty for isolation

    # Reward group chat activity
    if metrics.group_chats_joined >= SOCIAL_HIGH_GROUPS:
        bonus += 0.15  # Heavy group involvement
    elif metrics.group_chats_joined >= SOCIAL_MIN_GROUPS:
        bonus += 0.08  # Some group activity

    # Reward DM activity
    if metrics.dms_initiated >= SOCIAL_HIGH_DMS:
        bonus += 0.10  # High direct engagement
    elif metrics.dms_initiated >= SOCIAL_MIN_DMS:
        bonus += 0.05  # Some direct engagement

    # Reward posting/commenting
    total_posts = metrics.posts_created + metrics.comments_made
    if total_posts >= 10:
        bonus += 0.08  # Active poster
    elif total_posts >= 3:
        bonus += 0.04  # Some content creation

    # Penalize heavy trading focus
    if metrics.social_to_trade_ratio < 0.5 and metrics.trades_executed > 5:
        bonus -= 0.10

    return clamp_bonus(bonus)


def _calculate_scammer_bonus(metrics: BehaviorMetrics) -> float:
    """
    Scammer: Reward profit through social manipulation.
    Penalize honest trading without social element.
    """
    bonus = 0.0

    # Must have some social engagement (need marks to scam)
    if metrics.unique_users_interacted >= 5:
        bonus += 0.10
    elif metrics.unique_users_interacted < 2:
        bonus -= 0.20  # Hard penalty for no social manipulation

    # Reward DM activity (private manipulation channels)
    if metrics.dms_initiated >= 5:
        bonus += 0.10
    elif metrics.dms_initiated >= 2:
        bonus += 0.05

    # Must profit to be a successful scammer
    if metrics.total_pnl > 0:
        bonus += 0.15
    else:
        bonus -= 0.15  # Failed scammer

    # Reward maintaining reputation (building trust to exploit)
    if metrics.reputation_delta > 0:
        bonus += 0.10
    elif metrics.reputation_delta < -20:
        bonus -= 0.10  # Got caught

    return clamp_bonus(bonus)


def _calculate_trader_bonus(metrics: BehaviorMetrics) -> float:
    """
    Trader: Reward disciplined, profitable trading.
    Penalize social distractions.
    """
    bonus = 0.0

    # Reward good win rate
    if metrics.win_rate >= TRADER_HIGH_WIN_RATE:
        bonus += BONUS_GOOD
    elif metrics.win_rate >= TRADER_GOOD_WIN_RATE:
        bonus += 0.08
    elif metrics.win_rate < TRADER_LOW_WIN_RATE and metrics.trades_executed >= 5:
        bonus += PENALTY_MODERATE

    # Reward diversification
    if metrics.markets_traded >= TRADER_HIGH_DIVERSIFICATION:
        bonus += BONUS_MODERATE
    elif metrics.markets_traded >= TRADER_MIN_DIVERSIFICATION:
        bonus += BONUS_MINOR

    # Penalize high social to trade ratio (should be trading, not socializing)
    if metrics.social_to_trade_ratio > 1.0:
        bonus += PENALTY_MODERATE

    # Reward consistent activity
    if metrics.trades_executed >= 5:
        bonus += BONUS_MINOR

    return clamp_bonus(bonus)


def _calculate_researcher_bonus(metrics: BehaviorMetrics) -> float:
    """
    Researcher: Reward analysis and research activity.
    Reward correlation between research and accurate predictions.
    """
    bonus = 0.0

    # Reward research actions
    if metrics.research_actions >= RESEARCHER_HIGH_ACTIONS:
        bonus += BONUS_EXCELLENT
    elif metrics.research_actions >= RESEARCHER_MOD_ACTIONS:
        bonus += 0.12
    elif metrics.research_actions >= 2:
        bonus += 0.06
    elif metrics.research_actions == 0:
        bonus += PENALTY_SEVERE  # Not researching = not a researcher

    # Reward high prediction accuracy
    if metrics.prediction_accuracy >= RESEARCHER_HIGH_ACCURACY:
        bonus += BONUS_EXCELLENT
    elif metrics.prediction_accuracy >= RESEARCHER_GOOD_ACCURACY:
        bonus += BONUS_MODERATE

    # Reward quality over quantity (fewer but better trades)
    if metrics.win_rate >= TRADER_HIGH_WIN_RATE and metrics.trades_executed <= 10:
        bonus += BONUS_MODERATE

    return clamp_bonus(bonus)


def _calculate_information_trader_bonus(metrics: BehaviorMetrics) -> float:
    """
    Information Trader: Reward balance of social intel gathering and trading.
    """
    bonus = 0.0

    # Need balanced social-to-trade ratio (0.5 to 1.5 is ideal)
    if 0.5 <= metrics.social_to_trade_ratio <= 1.5:
        bonus += 0.15
    elif metrics.social_to_trade_ratio > 3.0:
        bonus -= 0.10  # Too social, not trading on info
    elif metrics.social_to_trade_ratio < 0.2 and metrics.trades_executed > 3:
        bonus -= 0.10  # Pure trading, no intel gathering

    # Reward group chat participation (info sources)
    if metrics.group_chats_joined >= 3:
        bonus += 0.10

    # Reward DM conversations (private intel)
    if metrics.dms_initiated >= 3:
        bonus += 0.08

    # Reward info requests (actively seeking intel)
    if metrics.info_requests_sent >= 3:
        bonus += 0.08

    # Must still profit from the intel
    if metrics.total_pnl > 0:
        bonus += 0.10

    return clamp_bonus(bonus)


def _calculate_goody_twoshoes_bonus(metrics: BehaviorMetrics) -> float:
    """
    Goody Two-Shoes: Reward helpfulness and reputation building.
    """
    bonus = 0.0

    # Reward reputation gains (most important)
    if metrics.reputation_delta >= 30:
        bonus += 0.25
    elif metrics.reputation_delta >= 10:
        bonus += 0.15
    elif metrics.reputation_delta >= 0:
        bonus += 0.05
    else:
        bonus -= 0.15  # Losing reputation = not being good

    # Reward information sharing
    if metrics.info_shared >= 5:
        bonus += 0.12
    elif metrics.info_shared >= 2:
        bonus += 0.06

    # Reward positive reactions
    if metrics.positive_reactions >= 10:
        bonus += 0.10
    elif metrics.positive_reactions >= 3:
        bonus += 0.05

    # Reward follower gains
    if metrics.followers_gained >= 5:
        bonus += 0.08

    return clamp_bonus(bonus)


def _calculate_ass_kisser_bonus(metrics: BehaviorMetrics) -> float:
    """
    Ass-Kisser: Reward reputation and follower gains through flattery.
    """
    bonus = 0.0

    # Reputation gains are everything
    if metrics.reputation_delta >= 50:
        bonus += 0.30
    elif metrics.reputation_delta >= 20:
        bonus += 0.20
    elif metrics.reputation_delta >= 5:
        bonus += 0.10
    elif metrics.reputation_delta < 0:
        bonus -= 0.20  # Failed flattery

    # Reward follower gains
    if metrics.followers_gained >= 10:
        bonus += 0.15
    elif metrics.followers_gained >= 3:
        bonus += 0.08

    # Reward commenting activity (public flattery)
    if metrics.comments_made >= 10:
        bonus += 0.08
    elif metrics.comments_made >= 5:
        bonus += 0.04

    # Reward DM activity (personal flattery)
    if metrics.dms_initiated >= 5:
        bonus += 0.05

    return clamp_bonus(bonus)


def _calculate_perps_trader_bonus(metrics: BehaviorMetrics) -> float:
    """
    Perps Trader: Reward risk-managed leveraged trading.
    Penalize over-leverage and liquidations.
    """
    bonus = 0.0

    # Reward good win rate (direction calling)
    if metrics.win_rate >= 0.55:
        bonus += 0.15
    elif metrics.win_rate < 0.40 and metrics.trades_executed >= 5:
        bonus -= 0.15  # Wrong direction too often

    # Reward active perp trading
    if metrics.trades_executed >= 10:
        bonus += 0.10
    elif metrics.trades_executed >= 5:
        bonus += 0.05
    elif metrics.trades_executed < 2:
        bonus -= 0.10  # Not trading perps

    # Penalize high variance (poor risk management with leverage)
    if metrics.pnl_variance > 1000:
        bonus -= 0.10  # Too volatile for leveraged trading

    # Reward profitability (must make money with leverage)
    if metrics.total_pnl > 0:
        bonus += 0.10
    elif metrics.total_pnl < -200:
        bonus -= 0.15  # Big losses = blown up

    return clamp_bonus(bonus)


def _calculate_super_predictor_bonus(metrics: BehaviorMetrics) -> float:
    """
    Super Predictor: Reward high prediction accuracy.
    Quality over quantity.
    """
    bonus = 0.0

    # Prediction accuracy is king
    if metrics.prediction_accuracy >= 0.75:
        bonus += 0.30
    elif metrics.prediction_accuracy >= 0.60:
        bonus += 0.18
    elif metrics.prediction_accuracy >= 0.50:
        bonus += 0.08
    elif metrics.predictions_made >= 5 and metrics.prediction_accuracy < 0.45:
        bonus -= 0.20  # Wrong too often

    # Reward research (should analyze before predicting)
    if metrics.research_actions >= 3:
        bonus += 0.08

    # Reward making predictions
    if metrics.predictions_made >= 5:
        bonus += 0.08
    elif metrics.predictions_made == 0:
        bonus -= 0.15  # Not predicting = not a predictor

    # Reward translating predictions to profit
    if metrics.total_pnl > 0 and metrics.prediction_accuracy >= 0.55:
        bonus += 0.08

    return clamp_bonus(bonus)


def _calculate_infosec_bonus(metrics: BehaviorMetrics) -> float:
    """
    Infosec: Reward caution, verification, and avoiding manipulation.
    """
    bonus = 0.0

    # Reward low information sharing (protective)
    if metrics.info_shared <= 1:
        bonus += 0.15
    elif metrics.info_shared >= 5:
        bonus -= 0.10  # Oversharing

    # Reward avoiding big losses (didn't fall for scams)
    if metrics.largest_loss > -50:  # Small losses only
        bonus += 0.15
    elif metrics.largest_loss < -200:
        bonus -= 0.15  # Big loss = got scammed

    # Reward research/verification
    if metrics.research_actions >= 3:
        bonus += 0.10

    # Reward consistent, steady behavior
    if metrics.pnl_variance < 100:
        bonus += 0.10

    # Penalize high DM response (could be manipulation attempts)
    if metrics.dms_initiated < 3:
        bonus += 0.05  # Cautious with DMs

    return clamp_bonus(bonus)


def _calculate_liar_bonus(metrics: BehaviorMetrics) -> float:
    """
    Liar: Reward successful deception and information spread.
    """
    bonus = 0.0

    # Reward information spread (lies propagating)
    if metrics.information_spread >= 10:
        bonus += 0.20
    elif metrics.information_spread >= 3:
        bonus += 0.10

    # Reward social engagement (audience for lies)
    if metrics.unique_users_interacted >= 8:
        bonus += 0.12
    elif metrics.unique_users_interacted >= 3:
        bonus += 0.06
    elif metrics.unique_users_interacted < 2:
        bonus -= 0.15  # No audience

    # Reward maintaining reputation despite lying
    if metrics.reputation_delta >= 0:
        bonus += 0.15  # Not caught
    elif metrics.reputation_delta < -20:
        bonus -= 0.15  # Got exposed

    # Reward posting activity (platforms for misinformation)
    if metrics.posts_created >= 5:
        bonus += 0.08
    elif metrics.posts_created >= 2:
        bonus += 0.04

    return clamp_bonus(bonus)


# =============================================================================
# Priority Metrics Scoring
# =============================================================================


def extract_metric_value(
    metric_name: str,
    metrics: BehaviorMetrics,
) -> Optional[float]:
    """
    Extract metric value from BehaviorMetrics based on priority metric name.
    
    Metric names from rubrics.json follow format: category.metricName
    e.g., "trading.totalPnL", "social.uniqueUsersInteracted"
    """
    # Mapping from rubrics.json metric names to BehaviorMetrics attributes
    metric_map = {
        # Trading metrics
        "trading.totalPnL": metrics.total_pnl,
        "trading.sharpeRatio": 0.0,  # Not directly available, computed if needed
        "trading.winRate": metrics.win_rate,
        "trading.marketsTraded": float(metrics.markets_traded),
        "trading.tradesExecuted": float(metrics.trades_executed),
        "trading.avgPositionSize": metrics.avg_position_size,
        "trading.largestWin": metrics.largest_win,
        "trading.largestLoss": metrics.largest_loss,
        "trading.maxDrawdown": 0.0,  # Not directly available
        
        # Social metrics
        "social.uniqueUsersInteracted": float(metrics.unique_users_interacted),
        "social.groupChatsJoined": float(metrics.group_chats_joined),
        "social.dmsInitiated": float(metrics.dms_initiated),
        "social.postsCreated": float(metrics.posts_created),
        "social.commentsMade": float(metrics.comments_made),
        "social.mentionsGiven": float(metrics.mentions_given),
        "social.groupMessagesSent": float(metrics.group_chats_joined),  # Approximation
        "social.dmResponseRate": 0.5,  # Default, not tracked separately
        
        # Influence metrics
        "influence.reputationDelta": float(metrics.reputation_delta),
        "influence.followersGained": float(metrics.followers_gained),
        "influence.positiveReactions": float(metrics.positive_reactions),
        "influence.informationSpread": float(metrics.information_spread),
        
        # Information metrics
        "information.researchActions": float(metrics.research_actions),
        "information.predictionAccuracy": metrics.prediction_accuracy,
        "information.predictionsMade": float(metrics.predictions_made),
        "information.correctPredictions": float(metrics.correct_predictions),
        "information.marketDataQueries": float(metrics.research_actions),  # Approximation
        "information.newsConsumed": 0.0,  # Not tracked separately
        "information.infoRequestsSent": float(metrics.info_requests_sent),
        "information.infoShared": float(metrics.info_shared),
        
        # Behavior metrics
        "behavior.socialToTradeRatio": metrics.social_to_trade_ratio,
        "behavior.actionsPerTick": metrics.actions_per_tick,
        "behavior.actionSuccessRate": metrics.win_rate,  # Approximation
        "behavior.episodeLength": float(metrics.episode_length),
        "behavior.consistencyScore": 0.5,  # Default, not tracked separately
    }
    
    return metric_map.get(metric_name)


def normalize_metric_value(
    metric_name: str,
    value: float,
) -> float:
    """
    Normalize a metric value to 0-1 range based on expected ranges.
    
    Different metrics have different expected ranges.
    """
    # Expected ranges for normalization
    # These are reasonable defaults that can be tuned
    normalization_ranges = {
        # Trading (can be negative)
        "trading.totalPnL": (-1000, 5000),
        "trading.sharpeRatio": (-1.0, 3.0),
        "trading.winRate": (0.0, 1.0),
        "trading.marketsTraded": (0, 10),
        "trading.tradesExecuted": (0, 50),
        "trading.avgPositionSize": (0, 1000),
        "trading.largestWin": (0, 2000),
        "trading.largestLoss": (-2000, 0),
        "trading.maxDrawdown": (0, 1000),
        
        # Social (always positive)
        "social.uniqueUsersInteracted": (0, 30),
        "social.groupChatsJoined": (0, 10),
        "social.dmsInitiated": (0, 20),
        "social.postsCreated": (0, 20),
        "social.commentsMade": (0, 30),
        "social.mentionsGiven": (0, 20),
        "social.groupMessagesSent": (0, 50),
        "social.dmResponseRate": (0.0, 1.0),
        
        # Influence (can be negative)
        "influence.reputationDelta": (-50, 100),
        "influence.followersGained": (-10, 30),
        "influence.positiveReactions": (0, 50),
        "influence.informationSpread": (0, 20),
        
        # Information (always positive)
        "information.researchActions": (0, 20),
        "information.predictionAccuracy": (0.0, 1.0),
        "information.predictionsMade": (0, 20),
        "information.correctPredictions": (0, 15),
        "information.marketDataQueries": (0, 20),
        "information.newsConsumed": (0, 10),
        "information.infoRequestsSent": (0, 15),
        "information.infoShared": (0, 15),
        
        # Behavior
        "behavior.socialToTradeRatio": (0.0, 5.0),
        "behavior.actionsPerTick": (0.0, 3.0),
        "behavior.actionSuccessRate": (0.0, 1.0),
        "behavior.episodeLength": (0, 50),
        "behavior.consistencyScore": (0.0, 1.0),
    }
    
    range_info = normalization_ranges.get(metric_name, (0, 100))
    min_val, max_val = range_info
    
    if max_val == min_val:
        return 0.5
    
    # Normalize to 0-1
    normalized = (value - min_val) / (max_val - min_val)
    return max(0.0, min(1.0, normalized))


def calculate_priority_weighted_score(
    archetype: str,
    metrics: BehaviorMetrics,
) -> float:
    """
    Calculate score based on archetype's priority metrics from rubrics.json.
    
    Uses weighted sum where first priority metric gets highest weight.
    """
    archetype_norm = normalize_archetype(archetype)
    priority_metrics = get_priority_metrics(archetype_norm)
    
    if not priority_metrics:
        return 0.5  # Default if no priority metrics defined
    
    # Weights decrease by position (first is most important)
    # e.g., [0.35, 0.25, 0.20, 0.12, 0.08] for 5 metrics
    weights = []
    total_weight = 0.0
    for i, _ in enumerate(priority_metrics):
        weight = 1.0 / (i + 1)  # Harmonic weights: 1, 0.5, 0.33, 0.25, ...
        weights.append(weight)
        total_weight += weight
    
    # Normalize weights to sum to 1
    weights = [w / total_weight for w in weights]
    
    # Calculate weighted score
    weighted_sum = 0.0
    for i, metric_name in enumerate(priority_metrics):
        value = extract_metric_value(metric_name, metrics)
        if value is not None:
            normalized_value = normalize_metric_value(metric_name, value)
            weighted_sum += weights[i] * normalized_value
    
    return weighted_sum


# =============================================================================
# Archetype Composite Reward
# =============================================================================

def archetype_composite_reward(
    inputs: TrajectoryRewardInputs,
    archetype: str,
    behavior_metrics: Optional[BehaviorMetrics] = None,
) -> float:
    """
    Compute archetype-aware composite reward.

    Different archetypes have different success criteria. This function
    combines PnL, format, reasoning, and behavior scores using weights
    specific to the archetype.
    
    Also incorporates priority metrics from rubrics.json for each archetype.

    Args:
        inputs: Standard trajectory reward inputs (PnL, format, reasoning scores)
        archetype: Agent archetype (e.g., "degen", "trader", "social-butterfly")
        behavior_metrics: Optional extracted behavior metrics for behavior bonus

    Returns:
        Composite reward score in range [-1.0, 1.0]
    """
    archetype_norm = normalize_archetype(archetype)
    weights = get_archetype_weights(archetype_norm)

    # 1. Calculate PnL Score
    if inputs.end_balance != inputs.starting_balance:
        pnl_score = calculate_pnl_reward(inputs.starting_balance, inputs.end_balance)
    else:
        end_bal = inputs.starting_balance + inputs.final_pnl
        pnl_score = calculate_pnl_reward(inputs.starting_balance, end_bal)

    # Archetype-specific PnL adjustments
    if archetype_norm == "degen" and pnl_score < 0:
        # Degens shouldn't be heavily penalized for losses
        pnl_score = pnl_score * 0.3

    if archetype_norm == "social-butterfly" and pnl_score < 0:
        # Social butterflies shouldn't care much about trading losses
        pnl_score = pnl_score * 0.5

    # Bankruptcy still matters for most archetypes
    if pnl_score <= -5.0 and archetype_norm not in ("degen", "social-butterfly"):
        return max(-1.0, pnl_score)

    # 2. Risk penalty for risky actions (except for degens who embrace risk)
    if inputs.risky_actions_count > 0 and archetype_norm != "degen":
        pnl_score -= (inputs.risky_actions_count * ARCHETYPE_RISK_PENALTY_MULTIPLIER)

    # 3. Format and reasoning scores
    format_score = inputs.format_score
    reasoning_score = inputs.reasoning_score

    # 4. Behavior bonus from archetype-specific behaviors
    behavior_bonus = 0.0
    if behavior_metrics is not None:
        behavior_bonus = calculate_archetype_behavior_bonus(archetype_norm, behavior_metrics)
        
        # Also incorporate priority metrics score from rubrics.json
        priority_score = calculate_priority_weighted_score(archetype_norm, behavior_metrics)
        
        # Blend behavior bonus with priority metrics (priority metrics give 30% of behavior weight)
        behavior_bonus = behavior_bonus * 0.7 + (priority_score - 0.5) * 0.3

    # 5. Compute weighted composite
    total_weight = (
        weights["pnl"]
        + weights["format"]
        + weights["reasoning"]
        + weights["behavior"]
    )

    composite = (
        pnl_score * weights["pnl"]
        + format_score * weights["format"]
        + reasoning_score * weights["reasoning"]
        + behavior_bonus * weights["behavior"]
    ) / total_weight

    return max(-1.0, min(1.0, composite))


# =============================================================================
# Enhanced Composite Reward (with Regime & Counterfactual)
# =============================================================================

# Import MarketRegime here to avoid circular imports at module load
# The actual import happens in the function to ensure market_regime module is loaded


def enhanced_composite_reward(
    inputs: TrajectoryRewardInputs,
    archetype: str,
    behavior_metrics: Optional[BehaviorMetrics] = None,
    regime_overall: Optional[str] = None,
    regime_volatility: float = 0.5,
    regime_expected_return: float = 0.0,
    counterfactual_alpha: Optional[float] = None,
    temporal_credits: Optional[List[TemporalCredit]] = None,
    weight_profile: str = "default",
) -> float:
    """
    Enhanced archetype-aware reward with regime adjustment and counterfactual.
    
    This is the full-featured reward function that accounts for:
    1. Market regime (bull/bear/sideways adjustment)
    2. Counterfactual alpha (skill vs luck)
    3. Temporal credit (delayed reward attribution)
    4. Archetype-specific behavior bonuses
    5. Format and reasoning quality
    
    Backward compatible: if regime args are None, falls back to original
    archetype_composite_reward logic.
    
    Weight distribution (when enhanced mode active):
        - regime_adjusted_pnl: 35%
        - skill_alpha: 20%
        - temporal_bonus: 5%
        - format: 15%
        - reasoning: 10%
        - behavior: 15%
    
    Args:
        inputs: Standard trajectory reward inputs
        archetype: Agent archetype for behavior weighting
        behavior_metrics: Optional behavior metrics for archetype bonus
        regime_overall: Market regime ("bull", "bear", "sideways") or None
        regime_volatility: Normalized volatility (0.0-1.0)
        regime_expected_return: Expected return for this regime
        counterfactual_alpha: Pre-computed alpha (actual - benchmark)
        temporal_credits: List of temporal credit assignments
        weight_profile: Reward weight profile name from reward_weights.yaml
    
    Returns:
        Composite reward score in [-1.0, 1.0]
    """
    archetype_norm = normalize_archetype(archetype)
    
    # Check if we have enhanced context
    has_enhanced_context = regime_overall is not None or counterfactual_alpha is not None
    
    if not has_enhanced_context:
        # Fallback to original archetype_composite_reward
        return archetype_composite_reward(inputs, archetype, behavior_metrics)
    
    # ==========================================================================
    # Enhanced Mode: Full reward computation with regime awareness
    # ==========================================================================
    
    # 1. Regime-Adjusted PnL Score
    if regime_overall is not None:
        pnl_score = regime_adjusted_pnl_reward(
            actual_pnl=inputs.final_pnl,
            starting_balance=inputs.starting_balance,
            regime_overall=regime_overall,
            regime_volatility=regime_volatility,
            regime_expected_return=regime_expected_return,
        )
    else:
        # No regime info, use standard PnL reward
        pnl_score = calculate_pnl_reward(inputs.starting_balance, inputs.end_balance)
    
    # Archetype-specific PnL adjustments (carried over from original)
    if archetype_norm == "degen" and pnl_score < 0:
        pnl_score = pnl_score * 0.3  # Degens not penalized hard for losses
    if archetype_norm == "social-butterfly" and pnl_score < 0:
        pnl_score = pnl_score * 0.5  # Social butterflies don't care about trading
    
    # Bankruptcy check (even for degens)
    if inputs.end_balance <= 0 and archetype_norm not in ("degen", "social-butterfly"):
        return -1.0  # Hard penalty for bankruptcy
    
    # 2. Skill Alpha Score (Counterfactual)
    alpha_score = 0.0
    if counterfactual_alpha is not None:
        alpha_score = calculate_alpha_reward(
            alpha=counterfactual_alpha,
            starting_balance=inputs.starting_balance,
        )
    
    # 3. Temporal Credit Bonus
    temporal_bonus = 0.0
    if temporal_credits:
        temporal_bonus = calculate_temporal_credit_bonus(
            credits=temporal_credits,
            starting_balance=inputs.starting_balance,
        )
    
    # 4. Risk penalty for risky actions (except degens)
    risk_penalty = 0.0
    if inputs.risky_actions_count > 0 and archetype_norm != "degen":
        risk_penalty = inputs.risky_actions_count * ARCHETYPE_RISK_PENALTY_MULTIPLIER
    
    # 5. Format and Reasoning scores
    format_score = inputs.format_score
    reasoning_score = inputs.reasoning_score
    
    # 6. Behavior bonus from archetype-specific behaviors
    behavior_bonus = 0.0
    if behavior_metrics is not None:
        behavior_bonus = calculate_archetype_behavior_bonus(archetype_norm, behavior_metrics)
        
        # Incorporate priority metrics from rubrics.json
        priority_score = calculate_priority_weighted_score(archetype_norm, behavior_metrics)
        
        # Blend: 70% behavior bonus, 30% priority metrics
        behavior_bonus = behavior_bonus * 0.7 + (priority_score - 0.5) * 0.3
    
    # ==========================================================================
    # Enhanced Weight Distribution
    # ==========================================================================
    # Weights designed to emphasize skill (alpha) over luck (raw PnL)
    
    from .reward_config import get_reward_weights

    profile_weights = get_reward_weights(weight_profile)
    weights = {
        "regime_pnl": float(profile_weights.get("regime_pnl", profile_weights.get("pnl", 0.0))),
        "skill_alpha": float(profile_weights.get("skill_alpha", profile_weights.get("alpha", 0.0))),
        "temporal_bonus": float(profile_weights.get("temporal_bonus", profile_weights.get("temporal", 0.0))),
        "format": float(profile_weights.get("format", 0.0)),
        "reasoning": float(profile_weights.get("reasoning", 0.0)),
        "behavior": float(profile_weights.get("behavior", 0.0)),
    }

    total_weight = sum(weights.values())
    if total_weight <= 0:
        weights = {
            "regime_pnl": 0.35,
            "skill_alpha": 0.20,
            "temporal_bonus": 0.05,
            "format": 0.15,
            "reasoning": 0.10,
            "behavior": 0.15,
        }
        total_weight = 1.0

    if abs(total_weight - 1.0) > 1e-6:
        weights = {k: v / total_weight for k, v in weights.items()}
    
    # Compute weighted composite
    composite = (
        (pnl_score - risk_penalty) * weights["regime_pnl"]
        + alpha_score * weights["skill_alpha"]
        + temporal_bonus * weights["temporal_bonus"]
        + format_score * weights["format"]
        + reasoning_score * weights["reasoning"]
        + behavior_bonus * weights["behavior"]
    )
    
    return max(-1.0, min(1.0, composite))


# =============================================================================
# Social & Narrative Rewards (BAB-71)
# =============================================================================
# These functions provide PnL-independent reward signals for social archetypes
# like "Social Butterfly" and "Information Trader".

@dataclass
class SocialRewardResult:
    """
    Breakdown of social reward components for logging and analysis.
    
    Attributes:
        engagement_score: Score from social interactions (DMs, posts, comments)
        information_spread_score: Score from content that gets reactions/shares
        narrative_alignment_score: Score from actions aligned with ground truth
        network_score: Score from building connections
        total_score: Combined social reward
    """
    engagement_score: float = 0.0
    information_spread_score: float = 0.0
    narrative_alignment_score: float = 0.0
    network_score: float = 0.0
    total_score: float = 0.0
    
    def to_dict(self) -> Dict:
        """Serialize for logging."""
        return {
            "engagement_score": self.engagement_score,
            "information_spread_score": self.information_spread_score,
            "narrative_alignment_score": self.narrative_alignment_score,
            "network_score": self.network_score,
            "total_score": self.total_score,
        }


# Thresholds for social reward scoring
SOCIAL_EXCELLENT_SPREAD = 15  # Content spread to 15+ users
SOCIAL_GOOD_SPREAD = 5        # Content spread to 5+ users
SOCIAL_EXCELLENT_ENGAGEMENT = 20  # 20+ social actions
SOCIAL_GOOD_ENGAGEMENT = 10       # 10+ social actions
SOCIAL_EXCELLENT_NETWORK = 15     # 15+ unique connections
SOCIAL_GOOD_NETWORK = 8           # 8+ unique connections


def calculate_engagement_score(metrics: BehaviorMetrics) -> float:
    """
    Calculate engagement score based on social activity volume and quality.
    
    Rewards agents for:
    - Posting content
    - Commenting on others' content
    - Initiating DM conversations
    - Responding to group chats
    
    Args:
        metrics: Behavior metrics containing social activity counts
    
    Returns:
        Engagement score in [0.0, 1.0]
    """
    # Count total social actions
    total_social = (
        metrics.posts_created
        + metrics.comments_made
        + metrics.dms_initiated
        + metrics.group_chats_joined
        + metrics.mentions_given
    )
    
    # Base score from action volume
    if total_social >= SOCIAL_EXCELLENT_ENGAGEMENT:
        volume_score = 1.0
    elif total_social >= SOCIAL_GOOD_ENGAGEMENT:
        volume_score = 0.7 + (total_social - SOCIAL_GOOD_ENGAGEMENT) / (SOCIAL_EXCELLENT_ENGAGEMENT - SOCIAL_GOOD_ENGAGEMENT) * 0.3
    elif total_social >= 3:
        volume_score = 0.3 + (total_social - 3) / (SOCIAL_GOOD_ENGAGEMENT - 3) * 0.4
    else:
        volume_score = total_social * 0.1
    
    # Diversity bonus: reward varied activity (not just one type)
    activity_types = sum([
        1 if metrics.posts_created > 0 else 0,
        1 if metrics.comments_made > 0 else 0,
        1 if metrics.dms_initiated > 0 else 0,
        1 if metrics.group_chats_joined > 0 else 0,
        1 if metrics.mentions_given > 0 else 0,
    ])
    diversity_bonus = min(0.2, activity_types * 0.04)
    
    return min(1.0, volume_score + diversity_bonus)


def calculate_information_spread_score(metrics: BehaviorMetrics) -> float:
    """
    Calculate score based on how well content spread through the network.
    
    This rewards agents whose posts/content generate engagement:
    - Reactions (likes, shares)
    - Information reaching multiple users
    - Content that sparks discussion
    
    Args:
        metrics: Behavior metrics containing influence data
    
    Returns:
        Information spread score in [0.0, 1.0]
    """
    # Primary signal: direct spread metric
    spread = metrics.information_spread
    
    # Secondary signal: positive reactions as proxy for engaging content
    reactions = metrics.positive_reactions
    
    # Tertiary signal: follower gains indicate influential content
    followers = metrics.followers_gained
    
    # Score information spread
    if spread >= SOCIAL_EXCELLENT_SPREAD:
        spread_score = 1.0
    elif spread >= SOCIAL_GOOD_SPREAD:
        spread_score = 0.6 + (spread - SOCIAL_GOOD_SPREAD) / (SOCIAL_EXCELLENT_SPREAD - SOCIAL_GOOD_SPREAD) * 0.4
    elif spread > 0:
        spread_score = 0.2 + (spread / SOCIAL_GOOD_SPREAD) * 0.4
    else:
        spread_score = 0.0
    
    # Bonus for reactions (capped at 0.2)
    reaction_bonus = min(0.2, reactions * 0.02)
    
    # Bonus for follower gains (capped at 0.15)
    follower_bonus = min(0.15, max(0, followers) * 0.03)
    
    return min(1.0, spread_score + reaction_bonus + follower_bonus)


def calculate_network_score(metrics: BehaviorMetrics) -> float:
    """
    Calculate score based on network building and connections.
    
    Rewards agents for:
    - Building a wide network of connections
    - Participating in group activities
    - Maintaining positive reputation
    
    Args:
        metrics: Behavior metrics containing social connection data
    
    Returns:
        Network score in [0.0, 1.0]
    """
    connections = metrics.unique_users_interacted
    groups = metrics.group_chats_joined
    reputation = metrics.reputation_delta
    
    # Score network breadth
    if connections >= SOCIAL_EXCELLENT_NETWORK:
        network_score = 1.0
    elif connections >= SOCIAL_GOOD_NETWORK:
        network_score = 0.6 + (connections - SOCIAL_GOOD_NETWORK) / (SOCIAL_EXCELLENT_NETWORK - SOCIAL_GOOD_NETWORK) * 0.4
    elif connections >= 3:
        network_score = 0.2 + (connections - 3) / (SOCIAL_GOOD_NETWORK - 3) * 0.4
    else:
        network_score = connections * 0.07
    
    # Bonus for group participation (capped at 0.2)
    group_bonus = min(0.2, groups * 0.04)
    
    # Reputation modifier (can be negative)
    if reputation > 20:
        reputation_mod = 0.15
    elif reputation > 0:
        reputation_mod = reputation * 0.0075
    elif reputation < -10:
        reputation_mod = -0.15
    else:
        reputation_mod = reputation * 0.01
    
    return max(0.0, min(1.0, network_score + group_bonus + reputation_mod))


@dataclass
class NarrativeEvent:
    """
    A ground truth event that agents should react to.
    
    Attributes:
        tick: When the event occurred
        event_type: Type of causal event
        affected_tickers: Markets affected by this event
        direction: Expected market direction ("up", "down", "volatile")
        revealed: Whether the event was publicly revealed
    """
    tick: int = 0
    event_type: str = ""
    affected_tickers: List[str] = field(default_factory=list)
    direction: str = ""
    revealed: bool = False


def calculate_narrative_alignment_score(
    metrics: BehaviorMetrics,
    actions_timeline: Optional[List[Dict]] = None,
    narrative_events: Optional[List[NarrativeEvent]] = None,
) -> float:
    """
    Calculate how well agent's actions aligned with ground truth narrative.
    
    This rewards agents who:
    - React appropriately to revealed causal events
    - Share accurate information about events
    - Don't spread misinformation
    - Time their actions to narrative developments
    
    For simpler evaluation (without timeline), uses prediction accuracy
    as a proxy for narrative alignment.
    
    Args:
        metrics: Behavior metrics containing prediction data
        actions_timeline: Optional list of agent actions with timestamps
        narrative_events: Optional list of ground truth events
    
    Returns:
        Narrative alignment score in [0.0, 1.0]
    """
    # If no detailed timeline, use prediction accuracy as proxy
    if not actions_timeline or not narrative_events:
        # Use prediction accuracy as simple proxy
        if metrics.predictions_made == 0:
            return 0.5  # Neutral if no predictions
        return metrics.prediction_accuracy
    
    # Advanced scoring with timeline analysis
    alignment_score = 0.0
    total_events = len(narrative_events)
    
    if total_events == 0:
        return 0.5  # Neutral if no events
    
    events_reacted_to = 0
    correct_reactions = 0
    
    for event in narrative_events:
        if not event.revealed:
            continue  # Skip unrevealed events
        
        # Check if agent took action after this event
        post_event_actions = [
            a for a in actions_timeline
            if a.get("tick", 0) > event.tick
            and a.get("tick", 0) <= event.tick + 5  # Within 5 ticks
        ]
        
        if not post_event_actions:
            continue
        
        events_reacted_to += 1
        
        # Check if action direction matches event direction
        for action in post_event_actions:
            action_type = action.get("action_type", "").lower()
            ticker = action.get("ticker", "")
            
            if ticker not in event.affected_tickers:
                continue
            
            # Determine if action aligns with narrative
            is_buy = "buy" in action_type or "long" in action_type
            is_sell = "sell" in action_type or "short" in action_type
            
            if event.direction == "up" and is_buy:
                correct_reactions += 1
                break
            elif event.direction == "down" and is_sell:
                correct_reactions += 1
                break
    
    # Calculate alignment ratio
    if events_reacted_to > 0:
        alignment_score = correct_reactions / events_reacted_to
    else:
        alignment_score = 0.5  # Neutral if no reactions
    
    return alignment_score


def calculate_social_reward(
    metrics: BehaviorMetrics,
    archetype: str,
    actions_timeline: Optional[List[Dict]] = None,
    narrative_events: Optional[List[NarrativeEvent]] = None,
) -> SocialRewardResult:
    """
    Calculate comprehensive social reward for non-trading archetypes.
    
    This provides a PnL-independent reward signal based on:
    1. Engagement: Volume and diversity of social activity
    2. Information Spread: Content that reaches and engages others
    3. Network: Building connections and maintaining reputation
    4. Narrative Alignment: Actions that align with ground truth
    
    Different archetypes weight these components differently:
    - Social Butterfly: Emphasizes network and engagement
    - Information Trader: Emphasizes narrative alignment and spread
    - Scammer/Liar: Emphasizes spread (for misinformation)
    - Others: Balanced weights
    
    Args:
        metrics: Behavior metrics from trajectory
        archetype: Agent archetype for weight selection
        actions_timeline: Optional action timeline for narrative analysis
        narrative_events: Optional ground truth events
    
    Returns:
        SocialRewardResult with component breakdown
    """
    archetype_norm = normalize_archetype(archetype)
    
    # Calculate component scores
    engagement = calculate_engagement_score(metrics)
    spread = calculate_information_spread_score(metrics)
    network = calculate_network_score(metrics)
    narrative = calculate_narrative_alignment_score(
        metrics, actions_timeline, narrative_events
    )
    
    # Archetype-specific weights
    if archetype_norm == "social-butterfly":
        weights = {
            "engagement": 0.30,
            "spread": 0.20,
            "network": 0.40,
            "narrative": 0.10,
        }
    elif archetype_norm == "information-trader":
        weights = {
            "engagement": 0.15,
            "spread": 0.25,
            "network": 0.20,
            "narrative": 0.40,
        }
    elif archetype_norm in ("scammer", "liar"):
        weights = {
            "engagement": 0.20,
            "spread": 0.40,
            "network": 0.25,
            "narrative": 0.15,
        }
    elif archetype_norm == "goody-twoshoes":
        weights = {
            "engagement": 0.25,
            "spread": 0.20,
            "network": 0.30,
            "narrative": 0.25,
        }
    elif archetype_norm == "ass-kisser":
        weights = {
            "engagement": 0.35,
            "spread": 0.15,
            "network": 0.40,
            "narrative": 0.10,
        }
    else:
        # Default balanced weights
        weights = {
            "engagement": 0.25,
            "spread": 0.25,
            "network": 0.25,
            "narrative": 0.25,
        }
    
    # Compute weighted total
    total = (
        engagement * weights["engagement"]
        + spread * weights["spread"]
        + network * weights["network"]
        + narrative * weights["narrative"]
    )
    
    return SocialRewardResult(
        engagement_score=engagement,
        information_spread_score=spread,
        narrative_alignment_score=narrative,
        network_score=network,
        total_score=total,
    )


def social_only_composite_reward(
    inputs: TrajectoryRewardInputs,
    archetype: str,
    behavior_metrics: Optional[BehaviorMetrics] = None,
    actions_timeline: Optional[List[Dict]] = None,
    narrative_events: Optional[List[NarrativeEvent]] = None,
) -> float:
    """
    Composite reward optimized for social archetypes (minimal PnL weight).
    
    This is designed for archetypes like Social Butterfly where trading
    performance is largely irrelevant. The reward is primarily based on:
    - Social engagement and network building
    - Information spread and influence
    - Format and reasoning quality
    
    PnL only matters for bankruptcy prevention (hard penalty).
    
    Args:
        inputs: Standard trajectory reward inputs
        archetype: Agent archetype
        behavior_metrics: Behavior metrics for social scoring
        actions_timeline: Optional action timeline
        narrative_events: Optional ground truth events
    
    Returns:
        Composite reward in [-1.0, 1.0]
    """
    archetype_norm = normalize_archetype(archetype)
    
    # Hard bankruptcy penalty (even social butterflies shouldn't go broke)
    if inputs.end_balance <= 0:
        return -0.5  # Less severe than trader bankruptcy
    
    # Calculate social reward
    social_result = SocialRewardResult()
    if behavior_metrics is not None:
        social_result = calculate_social_reward(
            metrics=behavior_metrics,
            archetype=archetype_norm,
            actions_timeline=actions_timeline,
            narrative_events=narrative_events,
        )
    
    # Format and reasoning scores
    format_score = inputs.format_score
    reasoning_score = inputs.reasoning_score
    
    # Minimal PnL component (just for slight profit incentive)
    pnl_score = 0.0
    if inputs.final_pnl > 0:
        pnl_score = min(0.5, inputs.final_pnl / inputs.starting_balance * 5)
    elif inputs.final_pnl < -inputs.starting_balance * 0.5:
        pnl_score = -0.3  # Moderate penalty for heavy losses
    
    # Social archetype weights
    if archetype_norm == "social-butterfly":
        weights = {
            "social": 0.55,
            "format": 0.20,
            "reasoning": 0.15,
            "pnl": 0.10,
        }
    elif archetype_norm in ("ass-kisser", "goody-twoshoes"):
        weights = {
            "social": 0.50,
            "format": 0.25,
            "reasoning": 0.15,
            "pnl": 0.10,
        }
    else:
        # Default for other social-ish archetypes
        weights = {
            "social": 0.40,
            "format": 0.25,
            "reasoning": 0.20,
            "pnl": 0.15,
        }
    
    composite = (
        social_result.total_score * weights["social"]
        + format_score * weights["format"]
        + reasoning_score * weights["reasoning"]
        + pnl_score * weights["pnl"]
    )
    
    return max(-1.0, min(1.0, composite))
