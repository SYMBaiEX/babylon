"""RL Training orchestration"""

from .babylon_trainer import (
    BabylonTrainer,
    detect_hardware,
    check_mlx_available,
    estimate_vram_gb,
    BACKEND_CUDA,
    BACKEND_MLX,
    BACKEND_CPU,
    BACKEND_SERVERLESS,
    DEFAULT_LOCAL_MODEL,
    DEFAULT_MLX_MODEL,
    DEFAULT_CPU_MODEL,
    DEFAULT_SERVERLESS_MODEL,
)

__all__ = [
    "BabylonTrainer",
    "detect_hardware",
    "check_mlx_available",
    "estimate_vram_gb",
    "BACKEND_CUDA",
    "BACKEND_MLX",
    "BACKEND_CPU",
    "BACKEND_SERVERLESS",
    "DEFAULT_LOCAL_MODEL",
    "DEFAULT_MLX_MODEL",
    "DEFAULT_CPU_MODEL",
    "DEFAULT_SERVERLESS_MODEL",
]
