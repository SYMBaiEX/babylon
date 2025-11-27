"""
Babylon RL Training System - Atropos Framework
"""

__version__ = "2.0.0"

# Import and re-export main components
from .models import (
    BabylonTrajectory,
    MarketOutcomes,
    WindowStatistics,
    TrainingBatchSummary,
    AtroposScoredGroup,
    JudgeResponse,
)

from .data_bridge import (
    PostgresTrajectoryReader,
    BabylonToAtroposConverter,
    ScoredGroupResult,
    calculate_dropout_rate,
)

from .training import (
    # Atropos trainer (recommended)
    BabylonAtroposTrainer,
    AtroposTrainingConfig,
    BabylonRLAIFEnv,
    BabylonEnvConfig,
    # Reward functions
    pnl_reward,
    composite_reward,
    RewardNormalizer,
)

__all__ = [
    # Models
    "BabylonTrajectory",
    "MarketOutcomes",
    "WindowStatistics",
    "TrainingBatchSummary",
    "AtroposScoredGroup",
    "JudgeResponse",
    
    # Data Bridge
    "PostgresTrajectoryReader",
    "BabylonToAtroposConverter",
    "ScoredGroupResult",
    "calculate_dropout_rate",
    
    # Atropos Training (recommended)
    "BabylonAtroposTrainer",
    "AtroposTrainingConfig",
    "BabylonRLAIFEnv",
    "BabylonEnvConfig",
    "pnl_reward",
    "composite_reward",
    "RewardNormalizer",
]
