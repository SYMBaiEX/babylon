"""
Babylon RL Training System
"""

__version__ = "1.0.0"

# Import and re-export main components
from .models import (
    BabylonTrajectory,
    MarketOutcomes,
    WindowStatistics,
    TrainingBatchSummary
)

from .data_bridge import (
    PostgresTrajectoryReader,
    BabylonToARTConverter,
    calculate_dropout_rate
)

from .training import (
    BabylonTrainer,
    detect_hardware,
    check_mlx_available,
    BACKEND_CUDA,
    BACKEND_MLX,
    BACKEND_CPU,
    BACKEND_SERVERLESS,
)

__all__ = [
    # Models
    "BabylonTrajectory",
    "MarketOutcomes",
    "WindowStatistics",
    "TrainingBatchSummary",
    
    # Data Bridge
    "PostgresTrajectoryReader",
    "BabylonToARTConverter",
    "calculate_dropout_rate",
    
    # Training
    "BabylonTrainer",
    "detect_hardware",
    "check_mlx_available",
    "BACKEND_CUDA",
    "BACKEND_MLX",
    "BACKEND_CPU",
    "BACKEND_SERVERLESS",
]
