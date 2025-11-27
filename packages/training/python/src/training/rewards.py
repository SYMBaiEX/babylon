"""
Babylon Reward Functions for RLAIF

This module provides reward functions for scoring trading agent trajectories.
These can be used as fallback scoring when LLM judge is unavailable or as
supplementary signals for the judge.

Key reward functions:
- PnL-based rewards
- Risk-adjusted rewards (Sharpe-like)
- Action efficiency rewards
- Combined/composite rewards
"""

import math
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np


def pnl_reward(
    final_pnl: float,
    initial_balance: float = 10000.0,
    max_pnl_cap: float = 5000.0,
) -> float:
    """
    Simple PnL-based reward normalized to 0-1 range.
    
    Args:
        final_pnl: Final profit/loss in dollars
        initial_balance: Starting balance for normalization
        max_pnl_cap: Cap for maximum expected PnL
        
    Returns:
        Normalized reward between 0 and 1
    """
    # Normalize PnL relative to initial balance
    pnl_ratio = final_pnl / initial_balance
    
    # Sigmoid-like transformation for smooth reward
    # Maps roughly: -100% -> 0.1, 0% -> 0.5, +50% -> 0.9
    reward = 1.0 / (1.0 + math.exp(-5.0 * pnl_ratio))
    
    return max(0.0, min(1.0, reward))


def risk_adjusted_reward(
    final_pnl: float,
    max_drawdown: float,
    volatility: float,
    initial_balance: float = 10000.0,
) -> float:
    """
    Risk-adjusted reward similar to Sharpe ratio concept.
    
    Args:
        final_pnl: Final profit/loss
        max_drawdown: Maximum drawdown during episode (positive number)
        volatility: Standard deviation of returns
        initial_balance: Starting balance
        
    Returns:
        Risk-adjusted reward between 0 and 1
    """
    # Return component
    returns = final_pnl / initial_balance
    
    # Risk penalty
    drawdown_penalty = max_drawdown / initial_balance
    volatility_penalty = volatility / initial_balance if volatility > 0 else 0
    
    # Sharpe-like ratio (simplified)
    if volatility_penalty > 0:
        sharpe = returns / volatility_penalty
    else:
        sharpe = returns * 2  # No volatility means deterministic, scale up return
        
    # Combine with drawdown penalty
    risk_adjusted = sharpe - (drawdown_penalty * 0.5)
    
    # Transform to 0-1 range
    # Roughly: -2 -> 0.1, 0 -> 0.5, +2 -> 0.9
    reward = 1.0 / (1.0 + math.exp(-risk_adjusted))
    
    return max(0.0, min(1.0, reward))


def efficiency_reward(
    final_pnl: float,
    episode_length: int,
    trades_executed: int,
    target_efficiency: float = 100.0,
) -> float:
    """
    Reward for achieving results efficiently (fewer actions/trades).
    
    Args:
        final_pnl: Final profit/loss
        episode_length: Number of steps taken
        trades_executed: Number of trades made
        target_efficiency: Target PnL per trade
        
    Returns:
        Efficiency reward between 0 and 1
    """
    if trades_executed == 0:
        # No trades = neutral efficiency
        return 0.5
        
    # PnL per trade
    pnl_per_trade = final_pnl / trades_executed
    
    # Compare to target efficiency
    efficiency_ratio = pnl_per_trade / target_efficiency
    
    # Bonus for fewer steps if profitable
    step_bonus = 0.0
    if final_pnl > 0 and episode_length > 0:
        step_bonus = max(0.0, 1.0 - (episode_length / 100.0)) * 0.1
        
    # Transform to 0-1
    base_reward = 1.0 / (1.0 + math.exp(-efficiency_ratio))
    
    return max(0.0, min(1.0, base_reward + step_bonus))


def action_quality_reward(
    successful_actions: int,
    total_actions: int,
    profitable_trades: int,
    total_trades: int,
) -> float:
    """
    Reward based on action success rates.
    
    Args:
        successful_actions: Number of actions that succeeded
        total_actions: Total number of actions attempted
        profitable_trades: Number of profitable trades
        total_trades: Total trades executed
        
    Returns:
        Action quality reward between 0 and 1
    """
    # Action success rate
    if total_actions > 0:
        action_success_rate = successful_actions / total_actions
    else:
        action_success_rate = 0.5
        
    # Trade win rate
    if total_trades > 0:
        win_rate = profitable_trades / total_trades
    else:
        win_rate = 0.5
        
    # Combine with more weight on win rate
    reward = 0.3 * action_success_rate + 0.7 * win_rate
    
    return max(0.0, min(1.0, reward))


def composite_reward(
    trajectory: Dict,
    weights: Optional[Dict[str, float]] = None,
) -> float:
    """
    Composite reward combining multiple reward signals.
    
    Args:
        trajectory: Trajectory dictionary with metrics
        weights: Optional weight dict for each reward component
            Default: {"pnl": 0.5, "efficiency": 0.2, "quality": 0.3}
            
    Returns:
        Composite reward between 0 and 1
    """
    if weights is None:
        weights = {
            "pnl": 0.5,
            "efficiency": 0.2,
            "quality": 0.3,
        }
        
    rewards = {}
    
    # PnL reward
    final_pnl = trajectory.get("final_pnl", 0.0)
    rewards["pnl"] = pnl_reward(final_pnl)
    
    # Efficiency reward
    episode_length = trajectory.get("episode_length", 0)
    trades_executed = trajectory.get("trades_executed", 0)
    rewards["efficiency"] = efficiency_reward(
        final_pnl, episode_length, trades_executed
    )
    
    # Action quality reward
    steps = trajectory.get("steps", [])
    total_actions = len(steps)
    successful_actions = sum(
        1 for s in steps
        if isinstance(s, dict) and s.get("action", {}).get("success", False)
    )
    profitable_trades = 0  # Would need trade-level data
    rewards["quality"] = action_quality_reward(
        successful_actions, total_actions, profitable_trades, trades_executed
    )
    
    # Weighted sum
    total_weight = sum(weights.values())
    composite = sum(
        weights.get(k, 0) * v for k, v in rewards.items()
    ) / total_weight
    
    return max(0.0, min(1.0, composite))


def relative_scores(
    trajectories: List[Dict],
    reward_fn: Callable[[Dict], float] = composite_reward,
) -> List[float]:
    """
    Compute relative scores for a group of trajectories.
    
    This normalizes scores to have mean 0, suitable for GRPO training.
    
    Args:
        trajectories: List of trajectory dictionaries
        reward_fn: Reward function to compute base scores
        
    Returns:
        List of normalized scores (mean 0)
    """
    if not trajectories:
        return []
        
    # Compute raw scores
    scores = [reward_fn(t) for t in trajectories]
    
    # Normalize to mean 0
    mean_score = sum(scores) / len(scores)
    normalized = [s - mean_score for s in scores]
    
    # Optionally normalize variance
    if len(normalized) > 1:
        std = np.std(normalized)
        if std > 1e-8:
            normalized = [s / std for s in normalized]
            
    return normalized


def ranking_to_scores(
    rankings: List[int],
    margin: float = 0.1,
) -> List[float]:
    """
    Convert rankings to scores for GRPO.
    
    Args:
        rankings: List of ranks (1 = best, N = worst)
        margin: Score difference between adjacent ranks
        
    Returns:
        List of scores centered at 0
    """
    n = len(rankings)
    if n == 0:
        return []
        
    # Convert ranks to scores (higher rank = higher score)
    max_rank = max(rankings)
    scores = [(max_rank - r + 1) * margin for r in rankings]
    
    # Center at 0
    mean_score = sum(scores) / len(scores)
    return [s - mean_score for s in scores]


def pairwise_preferences_to_scores(
    preferences: List[Tuple[int, int]],
    n_items: int,
) -> List[float]:
    """
    Convert pairwise preferences to scores using win-rate.
    
    Args:
        preferences: List of (winner_idx, loser_idx) tuples
        n_items: Total number of items
        
    Returns:
        List of scores for each item, centered at 0
    """
    # Count wins and comparisons
    wins = np.zeros(n_items)
    comparisons = np.zeros(n_items)
    
    for winner, loser in preferences:
        wins[winner] += 1
        comparisons[winner] += 1
        comparisons[loser] += 1
        
    # Win-rate based scoring
    scores = np.zeros(n_items)
    for i in range(n_items):
        if comparisons[i] > 0:
            scores[i] = wins[i] / comparisons[i]
        else:
            scores[i] = 0.5
            
    # Center at 0
    scores = scores - scores.mean()
    
    return scores.tolist()


class RewardNormalizer:
    """
    Running normalizer for reward values.
    
    Keeps track of reward statistics and normalizes new rewards
    to have approximately mean 0 and std 1.
    """
    
    def __init__(self, decay: float = 0.99):
        """
        Args:
            decay: Exponential moving average decay factor
        """
        self.decay = decay
        self.mean = 0.0
        self.var = 1.0
        self.count = 0
        
    def update(self, rewards: List[float]):
        """Update statistics with new rewards."""
        if not rewards:
            return
            
        batch_mean = sum(rewards) / len(rewards)
        batch_var = sum((r - batch_mean) ** 2 for r in rewards) / len(rewards)
        
        if self.count == 0:
            self.mean = batch_mean
            self.var = batch_var
        else:
            self.mean = self.decay * self.mean + (1 - self.decay) * batch_mean
            self.var = self.decay * self.var + (1 - self.decay) * batch_var
            
        self.count += len(rewards)
        
    def normalize(self, rewards: List[float]) -> List[float]:
        """Normalize rewards using running statistics."""
        std = max(math.sqrt(self.var), 1e-8)
        return [(r - self.mean) / std for r in rewards]
        
    def denormalize(self, normalized: List[float]) -> List[float]:
        """Convert normalized rewards back to original scale."""
        std = max(math.sqrt(self.var), 1e-8)
        return [n * std + self.mean for n in normalized]

