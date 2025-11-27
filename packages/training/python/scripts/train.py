#!/usr/bin/env python3
"""
RL Training Script - Execute training pipeline using Atropos

Usage:
    python scripts/train.py --min-agents 5 --iterations 10
"""

import asyncio
import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dotenv import load_dotenv
import logging

from training.atropos_trainer import BabylonAtroposTrainer, AtroposTrainingConfig

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


async def train(
    min_agents: int,
    iterations: int,
    windows_per_iteration: int,
    lookback_hours: int,
    min_actions: int,
    learning_rate: float,
    target_trajectories: int,
    max_dropout: float
):
    """Main training function using Atropos"""
    load_dotenv()
    
    db_url = os.getenv('DATABASE_URL')
    judge_model = os.getenv('JUDGE_MODEL', 'gpt-4o-mini')
    base_model = os.getenv('BASE_MODEL', 'unsloth/Qwen3-4B-128K')
    project = os.getenv('PROJECT_NAME', 'babylon-agents')
    
    if not db_url:
        raise ValueError("DATABASE_URL required")
    
    logger.info("=" * 80)
    logger.info("BABYLON RL TRAINING (Atropos)")
    logger.info("=" * 80)
    logger.info(f"Project: {project}")
    logger.info(f"Base Model: {base_model}")
    logger.info(f"Judge Model: {judge_model}")
    logger.info("=" * 80)
    
    # Create Atropos trainer config
    config = AtroposTrainingConfig(
        model_name=base_model,
        database_url=db_url,
        api_url=os.getenv('ATROPOS_API_URL', 'http://localhost:8000'),
        vllm_port=int(os.getenv('VLLM_PORT', '9001')),
        learning_rate=learning_rate,
        judge_model=judge_model,
        min_agents_per_window=min_agents,
        lookback_hours=lookback_hours,
    )
    
    trainer = BabylonAtroposTrainer(config)
    
    for iteration in range(iterations):
        logger.info(f"\nITERATION {iteration + 1}/{iterations}")
        
        try:
            # Run training iteration
            result = await trainer.train(
                steps=windows_per_iteration,
                batch_size=4,
            )
            
            logger.info(f"✅ Iteration {iteration + 1} complete!")
            logger.info(f"   Steps: {result.get('steps', 'N/A')}")
            
        except Exception as e:
            logger.error(f"❌ Iteration {iteration + 1} failed: {e}")
            if iteration < iterations - 1:
                logger.info("   Continuing with next iteration...")
            continue
    
    logger.info("\n" + "=" * 80)
    logger.info("TRAINING COMPLETE")
    logger.info("=" * 80)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-agents", type=int, default=5)
    parser.add_argument("--iterations", type=int, default=10)
    parser.add_argument("--windows-per-iteration", type=int, default=20)
    parser.add_argument("--lookback-hours", type=int, default=168)
    parser.add_argument("--min-actions", type=int, default=5)
    parser.add_argument("--learning-rate", type=float, default=5e-6)
    parser.add_argument("--target-trajectories", type=int, default=1000)
    parser.add_argument("--max-dropout", type=float, default=0.3)
    
    args = parser.parse_args()
    
    asyncio.run(train(**vars(args)))
