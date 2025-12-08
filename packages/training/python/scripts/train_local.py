#!/usr/bin/env python3
"""
Babylon Local Training Script - Unified Mac (MLX) + GTX (CUDA) Support

This script provides training using REAL data from the database.
Only trajectories with actual LLM calls are used.

Supports:
- Apple Silicon (MLX) - LoRA fine-tuning
- NVIDIA GPU (PyTorch/CUDA) - Full or LoRA fine-tuning
- CPU fallback (slow but works)

Usage:
    # Mac with MLX (Apple Silicon)
    python scripts/train_local.py --backend mlx --model mlx-community/Qwen2.5-1.5B-Instruct-4bit
    
    # GTX/CUDA machine
    python scripts/train_local.py --backend cuda --model Qwen/Qwen2.5-1.5B-Instruct
    
    # CPU fallback (slow)
    python scripts/train_local.py --backend cpu --model Qwen/Qwen2.5-0.5B-Instruct

Small model recommendations for consumer hardware:
    Mac M1/M2 (8GB):   mlx-community/Qwen2.5-0.5B-Instruct-4bit
    Mac M1/M2 (16GB):  mlx-community/Qwen2.5-1.5B-Instruct-4bit
    GTX 3060 (12GB):   Qwen/Qwen2.5-1.5B-Instruct
    GTX 3080 (10GB):   Qwen/Qwen2.5-1.5B-Instruct
    GTX 4090 (24GB):   Qwen/Qwen2.5-3B-Instruct
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent.parent.parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# Backend Detection
# =============================================================================

def detect_backend() -> Literal["mlx", "cuda", "cpu"]:
    """Auto-detect the best available backend."""
    # Check for MLX (Apple Silicon)
    try:
        import mlx.core
        logger.info("MLX backend available (Apple Silicon)")
        return "mlx"
    except ImportError:
        pass
    
    # Check for CUDA
    try:
        import torch
        if torch.cuda.is_available():
            logger.info(f"CUDA backend available: {torch.cuda.get_device_name(0)}")
            return "cuda"
    except ImportError:
        pass
    
    logger.warning("No GPU backend available, falling back to CPU (slow)")
    return "cpu"


# =============================================================================
# Data Loading from Database
# =============================================================================

async def load_real_training_data(
    database_url: str,
    min_actions: int = 3,
    lookback_hours: int = 168,  # 1 week
    max_trajectories: int = 500,
) -> list[dict]:
    """
    Load REAL training data from the database.
    
    Only trajectories with actual LLM calls are loaded.
    """
    from src.data_bridge import PostgresTrajectoryReader
    
    logger.info("Loading real training data from database...")
    logger.info(f"  Lookback: {lookback_hours} hours")
    logger.info(f"  Min actions: {min_actions}")
    
    trajectories = []
    
    async with PostgresTrajectoryReader(database_url) as reader:
        # Get windows with data
        windows = await reader.get_window_ids(
            min_agents=1,
            lookback_hours=lookback_hours,
        )
        
        if not windows:
            logger.error("No trajectory windows found in database!")
            logger.error("Generate real trajectories first:")
            logger.error("  1. Start server: bun run dev")
            logger.error("  2. Run: babylon train parallel --archetypes trader --num-agents 2 --ticks 10")
            raise ValueError("No trajectory data in database")
        
        logger.info(f"Found {len(windows)} trajectory windows")
        
        # Load from multiple windows
        for window_id in windows[:100]:  # Check up to 100 windows
            window_trajectories = await reader.get_trajectories_by_window(
                window_id,
                min_actions=min_actions,
            )
            
            for traj in window_trajectories:
                # CRITICAL: Ensure we have REAL LLM calls with actual content
                # This prevents training on mocked/skipped/fake LLM responses
                llm_call_count = 0
                real_llm_calls = 0
                
                for step in traj.steps:
                    if step.llm_calls:
                        for call in step.llm_calls:
                            llm_call_count += 1
                            # Validate real content exists (not empty or templated)
                            has_system = call.system_prompt and len(call.system_prompt) > 20
                            has_user = call.user_prompt and len(call.user_prompt) > 20
                            has_response = call.response and len(call.response) > 30
                            
                            if has_system and has_user and has_response:
                                real_llm_calls += 1
                
                # Require at least 3 real LLM calls per trajectory
                if real_llm_calls >= 3:
                    trajectories.append(traj)
                elif llm_call_count > 0:
                    logger.debug(
                        f"Skipping trajectory {traj.trajectory_id}: "
                        f"only {real_llm_calls}/{llm_call_count} real LLM calls"
                    )
            
            if len(trajectories) >= max_trajectories:
                break
    
    logger.info(f"Loaded {len(trajectories)} real trajectories")
    
    if len(trajectories) < 10:
        logger.error(f"Insufficient training data: only {len(trajectories)} trajectories")
        logger.error("Need at least 10 trajectories with real LLM calls")
        raise ValueError("Insufficient training data")
    
    return trajectories


def trajectories_to_training_samples(trajectories: list) -> list[dict]:
    """
    Convert trajectories to training samples (messages format).
    
    Extracts LLM calls from trajectories.
    """
    samples = []
    
    for traj in trajectories:
        for step in traj.steps:
            if not step.llm_calls:
                continue
            
            for llm_call in step.llm_calls:
                # Skip empty or too short responses
                if not llm_call.response or len(llm_call.response) < 20:
                    continue
                
                # Build messages
                messages = []
                
                # System prompt
                if llm_call.system_prompt:
                    messages.append({
                        "role": "system",
                        "content": llm_call.system_prompt,
                    })
                
                # User prompt
                if llm_call.user_prompt:
                    messages.append({
                        "role": "user",
                        "content": llm_call.user_prompt,
                    })
                
                # Assistant response
                messages.append({
                    "role": "assistant",
                    "content": llm_call.response,
                })
                
                if len(messages) >= 2:  # Need at least user + assistant
                    samples.append({"messages": messages})
    
    logger.info(f"Converted to {len(samples)} training samples")
    return samples


# =============================================================================
# Training Backends
# =============================================================================

def train_mlx(
    samples: list[dict],
    model_name: str,
    output_dir: str,
    num_iters: int = 100,
    batch_size: int = 2,
    learning_rate: float = 1e-5,
) -> str:
    """Train using MLX LoRA on Apple Silicon."""
    import subprocess
    import tempfile
    
    logger.info("=" * 60)
    logger.info("MLX LORA TRAINING")
    logger.info("=" * 60)
    logger.info(f"Model: {model_name}")
    logger.info(f"Samples: {len(samples)}")
    logger.info(f"Iterations: {num_iters}")
    
    # Create data directory
    data_dir = os.path.join(output_dir, "training_data")
    os.makedirs(data_dir, exist_ok=True)
    
    # Split into train/valid (90/10)
    import random
    random.shuffle(samples)
    split_idx = int(len(samples) * 0.9)
    train_samples = samples[:split_idx]
    valid_samples = samples[split_idx:]
    
    # Write JSONL files
    train_path = os.path.join(data_dir, "train.jsonl")
    valid_path = os.path.join(data_dir, "valid.jsonl")
    
    with open(train_path, 'w') as f:
        for sample in train_samples:
            f.write(json.dumps(sample) + "\n")
    
    with open(valid_path, 'w') as f:
        for sample in valid_samples:
            f.write(json.dumps(sample) + "\n")
    
    logger.info(f"Training data: {len(train_samples)} samples")
    logger.info(f"Validation data: {len(valid_samples)} samples")
    
    # Run MLX LoRA
    adapter_path = os.path.join(output_dir, "adapters")
    
    cmd = [
        sys.executable, "-m", "mlx_lm", "lora",
        "--model", model_name,
        "--train",
        "--data", data_dir,
        "--adapter-path", adapter_path,
        "--batch-size", str(batch_size),
        "--iters", str(num_iters),
        "--learning-rate", str(learning_rate),
        "--steps-per-report", "10",
        "--steps-per-eval", "25",
        "--val-batches", "5",
        "--max-seq-length", "2048",
        "--num-layers", "8",
        "--mask-prompt",
    ]
    
    logger.info(f"Command: {' '.join(cmd)}")
    logger.info("-" * 60)
    
    result = subprocess.run(cmd, check=True)
    
    logger.info("-" * 60)
    logger.info(f"Training complete! Adapter: {adapter_path}")
    
    return adapter_path


def train_cuda(
    samples: list[dict],
    model_name: str,
    output_dir: str,
    epochs: int = 3,
    batch_size: int = 4,
    learning_rate: float = 2e-5,
    use_lora: bool = True,
) -> str:
    """Train using PyTorch/CUDA on NVIDIA GPU."""
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
    )
    from datasets import Dataset
    
    logger.info("=" * 60)
    logger.info("CUDA/PYTORCH TRAINING")
    logger.info("=" * 60)
    logger.info(f"Model: {model_name}")
    logger.info(f"Samples: {len(samples)}")
    logger.info(f"Epochs: {epochs}")
    logger.info(f"LoRA: {use_lora}")
    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    logger.info(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Format samples
    formatted = []
    for sample in samples:
        messages = sample.get("messages", [])
        if not messages:
            continue
        
        # Apply chat template
        try:
            text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            formatted.append({"text": text})
        except Exception as e:
            logger.warning(f"Failed to format sample: {e}")
    
    logger.info(f"Formatted {len(formatted)} samples")
    
    # Create dataset
    dataset = Dataset.from_list(formatted)
    
    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=2048,
            padding="max_length",
        )
    
    tokenized = dataset.map(tokenize_fn, batched=True, remove_columns=["text"])
    
    # Load model
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        trust_remote_code=True,
        device_map="auto",
    )
    
    # Apply LoRA if requested
    if use_lora:
        try:
            from peft import LoraConfig, get_peft_model, TaskType
            
            lora_config = LoraConfig(
                task_type=TaskType.CAUSAL_LM,
                r=16,
                lora_alpha=32,
                lora_dropout=0.1,
                target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
            )
            model = get_peft_model(model, lora_config)
            model.print_trainable_parameters()
        except ImportError:
            logger.warning("PEFT not installed, training full model")
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        warmup_steps=100,
        logging_steps=10,
        save_steps=500,
        save_total_limit=2,
        fp16=True,
        report_to="none",
        remove_unused_columns=False,
    )
    
    # Trainer
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=data_collator,
    )
    
    # Train
    logger.info("Starting training...")
    start_time = datetime.now()
    
    trainer.train()
    
    duration = datetime.now() - start_time
    logger.info(f"Training complete in {duration}")
    
    # Save
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save training info
    info = {
        "base_model": model_name,
        "training_samples": len(samples),
        "epochs": epochs,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "use_lora": use_lora,
        "duration_seconds": duration.total_seconds(),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    
    with open(os.path.join(output_dir, "training_info.json"), 'w') as f:
        json.dump(info, f, indent=2)
    
    logger.info(f"Model saved to: {output_dir}")
    return output_dir


def train_cpu(
    samples: list[dict],
    model_name: str,
    output_dir: str,
    epochs: int = 1,
    batch_size: int = 1,
    learning_rate: float = 1e-5,
) -> str:
    """Train using CPU (slow fallback)."""
    logger.warning("=" * 60)
    logger.warning("CPU TRAINING (SLOW)")
    logger.warning("=" * 60)
    logger.warning("CPU training is very slow. Consider using:")
    logger.warning("  - Apple Silicon Mac with MLX")
    logger.warning("  - NVIDIA GPU with CUDA")
    
    # Use same code as CUDA but force CPU
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
    )
    from datasets import Dataset
    
    # Use very small model for CPU
    if "0.5B" not in model_name:
        logger.warning(f"Forcing Qwen2.5-0.5B for CPU training (was: {model_name})")
        model_name = "Qwen/Qwen2.5-0.5B-Instruct"
    
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Format samples (limit for CPU)
    formatted = []
    for sample in samples[:100]:  # Limit to 100 samples for CPU
        messages = sample.get("messages", [])
        if not messages:
            continue
        try:
            text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            formatted.append({"text": text})
        except Exception:
            pass
    
    dataset = Dataset.from_list(formatted)
    
    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=512,  # Shorter for CPU
            padding="max_length",
        )
    
    tokenized = dataset.map(tokenize_fn, batched=True, remove_columns=["text"])
    
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float32,
        trust_remote_code=True,
    )
    
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        learning_rate=learning_rate,
        logging_steps=5,
        save_steps=100,
        report_to="none",
        remove_unused_columns=False,
    )
    
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=data_collator,
    )
    
    logger.info("Starting CPU training (this will be slow)...")
    trainer.train()
    
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    return output_dir


# =============================================================================
# Validation
# =============================================================================

def validate_trained_model(
    model_path: str,
    backend: Literal["mlx", "cuda", "cpu"],
    base_model: str | None = None,
) -> bool:
    """Validate the trained model by generating a test response."""
    logger.info("=" * 60)
    logger.info("VALIDATING TRAINED MODEL")
    logger.info("=" * 60)
    
    test_prompt = """You are a trading agent in Babylon prediction markets.

Current State:
- Balance: $10,000
- P&L: $250
- Positions: 2 open

Market Update:
- BTC prediction market at 68% probability
- Recent news: Fed announces rate cut consideration

Analyze this market update and explain your trading decision."""
    
    try:
        if backend == "mlx":
            from mlx_lm import load, generate
            
            # For MLX, model_path is the adapter path
            model, tokenizer = load(base_model, adapter_path=model_path)
            
            messages = [{"role": "user", "content": test_prompt}]
            prompt = tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            
            response = generate(
                model, tokenizer, prompt=prompt, max_tokens=200, verbose=False
            )
        else:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            
            tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=torch.float16 if backend == "cuda" else torch.float32,
                device_map="auto" if backend == "cuda" else None,
                trust_remote_code=True,
            )
            
            messages = [{"role": "user", "content": test_prompt}]
            prompt = tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            
            inputs = tokenizer(prompt, return_tensors="pt")
            if backend == "cuda":
                inputs = {k: v.cuda() for k, v in inputs.items()}
            
            outputs = model.generate(
                **inputs,
                max_new_tokens=200,
                temperature=0.7,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )
            
            response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        
        logger.info("Test Response:")
        logger.info("-" * 40)
        logger.info(response[:500] + ("..." if len(response) > 500 else ""))
        logger.info("-" * 40)
        
        # Basic validation
        if len(response) < 50:
            logger.error("Response too short - model may not be working")
            return False
        
        logger.info("✅ Model validation passed!")
        return True
        
    except Exception as e:
        logger.error(f"Model validation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


# =============================================================================
# Main
# =============================================================================

async def main_async(args):
    """Main async training function."""
    # Detect backend
    backend = args.backend or detect_backend()
    logger.info(f"Using backend: {backend}")
    
    # Set default model based on backend
    if args.model:
        model_name = args.model
    else:
        if backend == "mlx":
            model_name = "mlx-community/Qwen2.5-1.5B-Instruct-4bit"
        elif backend == "cuda":
            model_name = "Qwen/Qwen2.5-1.5B-Instruct"
        else:
            model_name = "Qwen/Qwen2.5-0.5B-Instruct"
    
    logger.info(f"Model: {model_name}")
    
    # Check database URL
    database_url = args.database_url or os.getenv("DATABASE_URL", "")
    if not database_url:
        logger.error("DATABASE_URL not set!")
        logger.error("Set DATABASE_URL environment variable or use --database-url")
        return 1
    
    # Create output directory
    output_dir = args.output
    os.makedirs(output_dir, exist_ok=True)
    
    # Load real training data
    trajectories = await load_real_training_data(
        database_url=database_url,
        min_actions=args.min_actions,
        lookback_hours=args.lookback_hours,
        max_trajectories=args.max_trajectories,
    )
    
    # Convert to training samples
    samples = trajectories_to_training_samples(trajectories)
    
    if len(samples) < 20:
        logger.error(f"Not enough training samples: {len(samples)}")
        logger.error("Need at least 20 samples. Generate more trajectories.")
        return 1
    
    # Train based on backend
    if backend == "mlx":
        model_path = train_mlx(
            samples=samples,
            model_name=model_name,
            output_dir=output_dir,
            num_iters=args.iters,
            batch_size=args.batch_size,
            learning_rate=args.lr,
        )
        base_model = model_name
    elif backend == "cuda":
        model_path = train_cuda(
            samples=samples,
            model_name=model_name,
            output_dir=output_dir,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            use_lora=args.lora,
        )
        base_model = None
    else:
        model_path = train_cpu(
            samples=samples,
            model_name=model_name,
            output_dir=output_dir,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
        )
        base_model = None
    
    # Validate
    if args.validate:
        valid = validate_trained_model(model_path, backend, base_model)
        if not valid:
            logger.warning("Model validation failed!")
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("TRAINING COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Backend: {backend}")
    logger.info(f"Model: {model_name}")
    logger.info(f"Samples: {len(samples)}")
    logger.info(f"Output: {model_path}")
    logger.info("=" * 60)
    
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Babylon Local Training - Unified Mac/GTX Support",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    # Backend
    parser.add_argument(
        "--backend",
        choices=["mlx", "cuda", "cpu"],
        default=None,
        help="Training backend (auto-detected if not specified)"
    )
    
    # Model
    parser.add_argument(
        "--model",
        default=None,
        help="Model to train (default depends on backend)"
    )
    
    # Data
    parser.add_argument(
        "--database-url",
        default=None,
        help="Database URL (or set DATABASE_URL env var)"
    )
    parser.add_argument(
        "--min-actions",
        type=int,
        default=3,
        help="Minimum actions per trajectory"
    )
    parser.add_argument(
        "--lookback-hours",
        type=int,
        default=168,
        help="Hours to look back for trajectories"
    )
    parser.add_argument(
        "--max-trajectories",
        type=int,
        default=500,
        help="Maximum trajectories to load"
    )
    
    # Training
    parser.add_argument(
        "--output",
        default="./trained_models/local",
        help="Output directory"
    )
    parser.add_argument(
        "--iters",
        type=int,
        default=100,
        help="Training iterations (MLX)"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=3,
        help="Training epochs (CUDA/CPU)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2,
        help="Batch size"
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=1e-5,
        help="Learning rate"
    )
    parser.add_argument(
        "--lora",
        action="store_true",
        default=True,
        help="Use LoRA (CUDA only)"
    )
    parser.add_argument(
        "--no-lora",
        action="store_false",
        dest="lora",
        help="Don't use LoRA (full fine-tuning)"
    )
    
    # Validation
    parser.add_argument(
        "--validate",
        action="store_true",
        default=True,
        help="Validate trained model"
    )
    parser.add_argument(
        "--no-validate",
        action="store_false",
        dest="validate",
        help="Skip validation"
    )
    
    args = parser.parse_args()
    
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())

