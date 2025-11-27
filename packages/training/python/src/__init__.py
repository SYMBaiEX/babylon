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

# Import non-torch training components directly
from .training import (
    # Reward functions
    pnl_reward,
    composite_reward,
    RewardNormalizer,
    # Quality utilities
    calculate_tick_quality_score,
    calculate_trajectory_quality_score,
    # Multi-prompt dataset
    MultiPromptDatasetBuilder,
    PromptDataset,
    PromptSample,
    # Tick reward attribution
    TickRewardAttributor,
    CallPurpose,
    # Archetype utilities (no torch)
    get_rubric,
    get_available_archetypes,
)


# Lazy imports for torch-dependent modules
def __getattr__(name: str):
    """Lazy import for torch-dependent modules."""
    if name in (
        "BabylonAtroposTrainer",
        "AtroposTrainingConfig",
    ):
        from .training.atropos_trainer import (
            BabylonAtroposTrainer,
            AtroposTrainingConfig,
        )
        return locals()[name]
    
    if name in (
        "BabylonRLAIFEnv",
        "BabylonEnvConfig",
    ):
        from .training.babylon_env import (
            BabylonRLAIFEnv,
            BabylonEnvConfig,
        )
        return locals()[name]
    
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


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
    
    # Atropos Training (lazy - requires torch)
    "BabylonAtroposTrainer",
    "AtroposTrainingConfig",
    "BabylonRLAIFEnv",
    "BabylonEnvConfig",
    
    # Rewards (no torch)
    "pnl_reward",
    "composite_reward",
    "RewardNormalizer",
    
    # Quality utilities (no torch)
    "calculate_tick_quality_score",
    "calculate_trajectory_quality_score",
    
    # Multi-prompt dataset (no torch)
    "MultiPromptDatasetBuilder",
    "PromptDataset",
    "PromptSample",
    
    # Tick reward (no torch)
    "TickRewardAttributor",
    "CallPurpose",
    
    # Archetype utilities (no torch)
    "get_rubric",
    "get_available_archetypes",
]
