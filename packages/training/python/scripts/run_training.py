#!/usr/bin/env python3
"""
Babylon RL Training - Full Pipeline Runner

This script orchestrates the complete RLAIF training pipeline:
1. Validates environment and prerequisites
2. Starts background services (Atropos API, vLLM)
3. Starts the Babylon RLAIF environment
4. Runs the GRPO trainer with optional W&B logging

Usage:
    # Basic training run
    python scripts/run_training.py --steps 100
    
    # With specific model and W&B
    python scripts/run_training.py --model Qwen/Qwen2.5-3B-Instruct --steps 100 --wandb-project my-project
    
    # Resume from checkpoint
    python scripts/run_training.py --resume ./trained_models/step_50
    
    # Disable W&B
    python scripts/run_training.py --steps 100 --no-wandb

Or run components separately:
    Terminal 1: run-api
    Terminal 2: python -m src.training.babylon_env serve --slurm false
    Terminal 3: python -m src.training.atropos_trainer --steps 100
"""

import argparse
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

# Load environment
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def validate_environment() -> list[str]:
    """
    Validate that all required environment variables and dependencies are present.
    
    Returns a list of error messages for missing requirements.
    """
    errors = []
    
    # Check DATABASE_URL
    if not os.getenv("DATABASE_URL"):
        errors.append(
            "DATABASE_URL not set. Required for loading training trajectories.\n"
            "  Set in .env or export DATABASE_URL=postgresql://..."
        )
    
    # Check OPENAI_API_KEY (for RLAIF judge)
    if not os.getenv("OPENAI_API_KEY"):
        errors.append(
            "OPENAI_API_KEY not set. Required for RLAIF judge scoring.\n"
            "  Set in .env or export OPENAI_API_KEY=sk-..."
        )
    
    # Check for run-api command (Atropos)
    import shutil
    if not shutil.which("run-api"):
        errors.append(
            "Atropos API not found. Install with: pip install atroposlib"
        )
    
    # Check for PyTorch and CUDA
    try:
        import torch
        if not torch.cuda.is_available():
            errors.append(
                "CUDA not available. GPU is recommended for training.\n"
                "  For CPU-only (slow), use --skip-vllm and provide external inference."
            )
        else:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1e9
            logger.info(f"GPU: {gpu_name} ({gpu_mem:.1f} GB)")
    except ImportError:
        errors.append("PyTorch not installed. Install with: pip install torch")
    
    return errors


class TrainingOrchestrator:
    """
    Orchestrates the complete training pipeline.
    
    Manages:
    - Service lifecycle (Atropos API, vLLM)
    - Environment server
    - GRPO trainer
    """
    
    def __init__(
        self,
        model_name: str = "Qwen/Qwen2.5-3B-Instruct",
        training_steps: int = 100,
        batch_size: int = 4,
        learning_rate: float = 1e-5,
        min_learning_rate: float = 1e-7,
        lr_scheduler: str = "cosine",
        warmup_steps: int = 10,
        api_port: int = 8000,
        vllm_port: int = 9001,
        vllm_gpu_memory: float = 0.45,
        save_path: str = "./trained_models",
        save_every: int = 5,
        keep_checkpoints: int = 3,
        resume_from: Optional[str] = None,
        use_wandb: bool = True,
        wandb_project: str = "babylon-training",
        wandb_entity: Optional[str] = None,
        wandb_run_name: Optional[str] = None,
        skip_services: bool = False,
        log_dir: str = "./logs",
    ):
        self.model_name = model_name
        self.training_steps = training_steps
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.min_learning_rate = min_learning_rate
        self.lr_scheduler = lr_scheduler
        self.warmup_steps = warmup_steps
        self.api_port = api_port
        self.vllm_port = vllm_port
        self.vllm_gpu_memory = vllm_gpu_memory
        self.save_path = save_path
        self.save_every = save_every
        self.keep_checkpoints = keep_checkpoints
        self.resume_from = resume_from
        self.use_wandb = use_wandb
        self.wandb_project = wandb_project
        self.wandb_entity = wandb_entity
        self.wandb_run_name = wandb_run_name
        self.skip_services = skip_services
        self.log_dir = Path(log_dir)
        
        self.env_process: Optional[subprocess.Popen] = None
        self.trainer_process: Optional[subprocess.Popen] = None
        self._service_manager = None
        self._shutdown_requested = False
        self._log_handles: list = []  # Track open file handles
        
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        if self._shutdown_requested:
            logger.warning("Forced shutdown, exiting immediately")
            sys.exit(1)
        
        logger.info("Received shutdown signal, cleaning up...")
        self._shutdown_requested = True
        self.cleanup()
        sys.exit(0)
        
    def cleanup(self):
        """Clean up all subprocesses and services"""
        self._stop_process(self.trainer_process, "trainer")
        self._stop_process(self.env_process, "environment")
        
        if self._service_manager:
            self._service_manager.stop_all()
        
        for handle in self._log_handles:
            handle.close()
        self._log_handles.clear()
    
    def _stop_process(self, proc: Optional[subprocess.Popen], name: str, timeout: int = 10) -> None:
        """Stop a subprocess gracefully"""
        if not proc:
            return
        
        logger.info(f"Stopping {name}...")
        proc.terminate()
        
        deadline = time.time() + timeout
        while proc.poll() is None and time.time() < deadline:
            time.sleep(0.5)
        
        if proc.poll() is None:
            proc.kill()
            proc.wait()
                    
    def start_services(self) -> bool:
        """Start background services using ServiceManager"""
        if self.skip_services:
            logger.info("Skipping service startup (--skip-services)")
            return True
        
        from src.training.service_manager import ServiceManager, ServiceConfig
        
        config = ServiceConfig(
            atropos_port=self.api_port,
            vllm_port=self.vllm_port,
            model_name=self.model_name,
            vllm_gpu_memory_utilization=self.vllm_gpu_memory,
            log_dir=str(self.log_dir / "services"),
        )
        
        self._service_manager = ServiceManager(config)
        
        if not self._service_manager.start_all():
            return False
        
        if not self._service_manager.wait_for_ready():
            logger.error("Services failed to become ready")
            return False
        
        return True
        
    def start_environment(self) -> bool:
        """Start Babylon RLAIF environment"""
        logger.info("Starting Babylon RLAIF environment...")
        
        env_cmd = [
            sys.executable, "-m", "src.training.babylon_env", "serve",
            "--slurm", "false",
            "--env--tokenizer_name", self.model_name,
            "--env--rollout_server_url", f"http://localhost:{self.api_port}",
            "--openai--model_name", self.model_name,
            "--openai--base_url", f"http://localhost:{self.vllm_port}/v1",
        ]
        
        if not self.use_wandb:
            env_cmd.extend(["--env--use_wandb", "false"])
        
        log_file = self.log_dir / "environment.log"
        log_handle = open(log_file, "w")
        self._log_handles.append(log_handle)
        
        self.env_process = subprocess.Popen(
            env_cmd,
            cwd=str(Path(__file__).parent.parent),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        
        time.sleep(5)  # Wait for environment to initialize
        
        if self.env_process.poll() is not None:
            logger.error(f"Environment failed to start (exit code: {self.env_process.returncode})")
            logger.error(f"Check logs at: {log_file}")
            return False
        
        logger.info(f"Environment started (PID: {self.env_process.pid}), logs: {log_file}")
        return True
            
    def start_trainer(self) -> bool:
        """Start GRPO trainer"""
        logger.info("Starting GRPO trainer...")
        
        trainer_cmd = [
            sys.executable, "-m", "src.training.atropos_trainer",
            "--model", self.model_name,
            "--steps", str(self.training_steps),
            "--batch-size", str(self.batch_size),
            "--lr", str(self.learning_rate),
            "--min-lr", str(self.min_learning_rate),
            "--lr-scheduler", self.lr_scheduler,
            "--warmup-steps", str(self.warmup_steps),
            "--api-url", f"http://localhost:{self.api_port}",
            "--vllm-port", str(self.vllm_port),
            "--save-path", self.save_path,
            "--save-every", str(self.save_every),
            "--keep-checkpoints", str(self.keep_checkpoints),
            "--log-file", str(self.log_dir / "training_metrics.jsonl"),
            "--wandb-project", self.wandb_project,
        ]
        
        if self.resume_from:
            trainer_cmd.extend(["--resume", self.resume_from])
        if not self.use_wandb:
            trainer_cmd.append("--no-wandb")
        if self.wandb_entity:
            trainer_cmd.extend(["--wandb-entity", self.wandb_entity])
        if self.wandb_run_name:
            trainer_cmd.extend(["--wandb-run-name", self.wandb_run_name])
        
        # Pipe stdout for streaming to console
        self.trainer_process = subprocess.Popen(
            trainer_cmd,
            cwd=str(Path(__file__).parent.parent),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        
        logger.info(f"Trainer started (PID: {self.trainer_process.pid})")
        return True
            
    def run(self) -> int:
        """Run the complete training pipeline"""
        self._log_config()
        start_time = time.time()
        
        try:
            for name, starter in [
                ("services", self.start_services),
                ("environment", self.start_environment),
                ("trainer", self.start_trainer),
            ]:
                if not starter():
                    logger.error(f"Failed to start {name}")
                    return 1
            
            return_code = self._stream_trainer_output()
            elapsed = time.time() - start_time
            
            if return_code == 0:
                logger.info("\n" + "=" * 70)
                logger.info("TRAINING COMPLETED SUCCESSFULLY")
                logger.info(f"Total time: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
                logger.info(f"Model saved to: {self.save_path}")
                logger.info("=" * 70)
            else:
                logger.error(f"Training failed with return code: {return_code}")
                logger.error(f"Check logs at: {self.log_dir}")
                
            return return_code
        finally:
            self.cleanup()
    
    def _log_config(self):
        """Log training configuration"""
        logger.info("=" * 70)
        logger.info("BABYLON RL TRAINING PIPELINE")
        logger.info("=" * 70)
        logger.info(f"Model: {self.model_name}")
        logger.info(f"Steps: {self.training_steps}")
        logger.info(f"Batch size: {self.batch_size}")
        logger.info(f"Learning rate: {self.learning_rate} (scheduler: {self.lr_scheduler})")
        logger.info(f"Save path: {self.save_path}")
        logger.info(f"W&B: {'enabled' if self.use_wandb else 'disabled'}")
        if self.resume_from:
            logger.info(f"Resuming from: {self.resume_from}")
        logger.info("=" * 70)
    
    def _stream_trainer_output(self) -> int:
        """Stream trainer output to console and log file"""
        logger.info("\n" + "-" * 70)
        logger.info("TRAINING IN PROGRESS")
        logger.info("-" * 70 + "\n")
        
        log_file = self.log_dir / "trainer.log"
        
        assert self.trainer_process is not None
        assert self.trainer_process.stdout is not None
        
        with open(log_file, "w") as log_handle:
            for line in iter(self.trainer_process.stdout.readline, b''):
                decoded = line.decode('utf-8', errors='replace')
                print(decoded, end='')
                log_handle.write(decoded)
                log_handle.flush()
        
        return self.trainer_process.wait()


def main():
    parser = argparse.ArgumentParser(
        description="Babylon RL Training Pipeline",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    # Model settings
    parser.add_argument(
        "--model",
        default="Qwen/Qwen2.5-3B-Instruct",
        help="Model to train"
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=100,
        help="Number of training steps"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=4,
        help="Batch size"
    )
    
    # Learning rate settings
    parser.add_argument(
        "--lr",
        type=float,
        default=1e-5,
        help="Initial learning rate"
    )
    parser.add_argument(
        "--min-lr",
        type=float,
        default=1e-7,
        help="Minimum learning rate"
    )
    parser.add_argument(
        "--lr-scheduler",
        choices=["constant", "linear", "cosine"],
        default="cosine",
        help="Learning rate scheduler"
    )
    parser.add_argument(
        "--warmup-steps",
        type=int,
        default=10,
        help="LR warmup steps"
    )
    
    # Service settings
    parser.add_argument(
        "--api-port",
        type=int,
        default=8000,
        help="Atropos API server port"
    )
    parser.add_argument(
        "--vllm-port",
        type=int,
        default=9001,
        help="vLLM inference server port"
    )
    parser.add_argument(
        "--vllm-gpu-memory",
        type=float,
        default=0.45,
        help="GPU memory fraction for vLLM"
    )
    parser.add_argument(
        "--skip-services",
        action="store_true",
        help="Skip starting services (assume already running)"
    )
    
    # Checkpoint settings
    parser.add_argument(
        "--save-path",
        default="./trained_models",
        help="Directory to save checkpoints"
    )
    parser.add_argument(
        "--save-every",
        type=int,
        default=5,
        help="Save checkpoint every N steps"
    )
    parser.add_argument(
        "--keep-checkpoints",
        type=int,
        default=3,
        help="Number of checkpoints to keep"
    )
    parser.add_argument(
        "--resume",
        help="Resume from checkpoint path"
    )
    
    # W&B settings
    parser.add_argument(
        "--wandb-project",
        default="babylon-training",
        help="W&B project name"
    )
    parser.add_argument(
        "--wandb-entity",
        help="W&B entity/team"
    )
    parser.add_argument(
        "--wandb-run-name",
        help="W&B run name"
    )
    parser.add_argument(
        "--no-wandb",
        action="store_true",
        help="Disable W&B logging"
    )
    
    # Logging
    parser.add_argument(
        "--log-dir",
        default="./logs",
        help="Directory for log files"
    )
    
    # Validation
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip environment validation"
    )
    
    args = parser.parse_args()
    
    # Validate environment
    if not args.skip_validation:
        errors = validate_environment()
        if errors:
            logger.error("Environment validation failed:")
            for error in errors:
                logger.error(f"  • {error}")
            logger.error("\nFix the above issues or use --skip-validation to bypass.")
            sys.exit(1)
    
    orchestrator = TrainingOrchestrator(
        model_name=args.model,
        training_steps=args.steps,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        min_learning_rate=args.min_lr,
        lr_scheduler=args.lr_scheduler,
        warmup_steps=args.warmup_steps,
        api_port=args.api_port,
        vllm_port=args.vllm_port,
        vllm_gpu_memory=args.vllm_gpu_memory,
        save_path=args.save_path,
        save_every=args.save_every,
        keep_checkpoints=args.keep_checkpoints,
        resume_from=args.resume,
        use_wandb=not args.no_wandb,
        wandb_project=args.wandb_project,
        wandb_entity=args.wandb_entity,
        wandb_run_name=args.wandb_run_name,
        skip_services=args.skip_services,
        log_dir=args.log_dir,
    )
    
    sys.exit(orchestrator.run())


if __name__ == "__main__":
    main()
