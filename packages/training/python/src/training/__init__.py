"""
RL Training orchestration for Babylon

This package provides training infrastructure:

1. **Atropos-based Trainer** (RECOMMENDED)
   - `atropos_trainer.py` - GRPO trainer consuming from Atropos API
   - `babylon_env.py` - RLAIF environment with LLM-as-judge scoring

2. **Fast Rollout Generation**
   - `rollout_generator.py` - High-speed rollout generation with full agent tick capture
   - `fast_simulator.py` - Unified simulator for benchmark + data generation
   - `multi_prompt_dataset.py` - Dataset preparation for each LLM call type

3. **Supporting Modules**
   - `rewards.py` - Reward functions and normalization
   - `quality_utils.py` - Trajectory quality scoring
   - `tick_reward_attribution.py` - Granular reward attribution for multi-call ticks

See README.md for usage instructions.
"""

# Atropos-based trainer (recommended)
from .atropos_trainer import (
    BabylonAtroposTrainer,
    AtroposTrainingConfig,
)

from .babylon_env import (
    BabylonRLAIFEnv,
    BabylonEnvConfig,
)

from .rewards import (
    pnl_reward,
    risk_adjusted_reward,
    efficiency_reward,
    action_quality_reward,
    composite_reward,
    relative_scores,
    ranking_to_scores,
    pairwise_preferences_to_scores,
    RewardNormalizer,
)

# Fast rollout generation
from .rollout_generator import (
    FastRolloutGenerator,
    RolloutConfig,
    RolloutResult,
    AgentTickData,
    RolloutQualityValidator,
    AgentRunner,
)

from .fast_simulator import (
    FastSimulator,
    SimulatorConfig,
    SimulatorMetrics,
    GameState,
)

from .quality_utils import (
    calculate_tick_quality_score,
    calculate_trajectory_quality_score,
    build_trajectory_from_ticks,
    state_to_observation,
    state_to_env_state,
    validate_trajectory_quality,
    ValidationResult,
)

from .multi_prompt_dataset import (
    MultiPromptDatasetBuilder,
    PromptDataset,
    PromptSample,
    prepare_multi_prompt_training_data,
    PromptTypeAnalyzer,
    validate_training_sample,
    validate_trajectory_for_training,
)

from .tick_reward_attribution import (
    TickRewardAttributor,
    TickData,
    TickOutcome,
    LLMCallRecord,
    CallPurpose,
    build_training_samples_from_tick,
    group_samples_for_grpo,
)

__all__ = [
    # Atropos trainer (recommended)
    "BabylonAtroposTrainer",
    "AtroposTrainingConfig",
    "BabylonRLAIFEnv",
    "BabylonEnvConfig",
    # Reward functions
    "pnl_reward",
    "risk_adjusted_reward",
    "efficiency_reward",
    "action_quality_reward",
    "composite_reward",
    "relative_scores",
    "ranking_to_scores",
    "pairwise_preferences_to_scores",
    "RewardNormalizer",
    # Fast rollout generation
    "FastRolloutGenerator",
    "RolloutConfig",
    "RolloutResult",
    "AgentTickData",
    "RolloutQualityValidator",
    "AgentRunner",
    "FastSimulator",
    "SimulatorConfig",
    "SimulatorMetrics",
    "GameState",
    "MultiPromptDatasetBuilder",
    "PromptDataset",
    "PromptSample",
    "prepare_multi_prompt_training_data",
    "PromptTypeAnalyzer",
    "validate_training_sample",
    "validate_trajectory_for_training",
    # Tick reward attribution
    "TickRewardAttributor",
    "TickData",
    "TickOutcome",
    "LLMCallRecord",
    "CallPurpose",
    "build_training_samples_from_tick",
    "group_samples_for_grpo",
    # Quality utilities
    "calculate_tick_quality_score",
    "calculate_trajectory_quality_score",
    "build_trajectory_from_ticks",
    "state_to_observation",
    "state_to_env_state",
    "validate_trajectory_quality",
    "ValidationResult",
]
