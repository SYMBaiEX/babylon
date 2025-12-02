#!/usr/bin/env python3
"""
Simple SFT (Supervised Fine-Tuning) Training Script

This script trains a model on the generated dataset using simple SFT.
For production GRPO training, use the full pipeline with Atropos.

Usage:
    python scripts/train_sft.py --data trained_models/training_data.json --output trained_models/sft_model
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from datasets import Dataset

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def load_training_data(data_path: str) -> list[dict]:
    """Load and format training data."""
    with open(data_path, 'r') as f:
        data = json.load(f)
    
    samples = []
    for purpose, purpose_samples in data.get('samples', {}).items():
        for sample in purpose_samples:
            # Only use high-quality samples (positive score)
            if sample.get('score', 0) > 0.5:
                samples.append({
                    'system': sample['system_prompt'],
                    'user': sample['user_prompt'],
                    'assistant': sample['response'],
                    'score': sample['score'],
                })
    
    logger.info(f"Loaded {len(samples)} high-quality samples")
    return samples


def format_for_training(samples: list[dict], tokenizer) -> Dataset:
    """Format samples into training dataset."""
    formatted = []
    
    for sample in samples:
        # Format as ChatML
        text = f"""<|im_start|>system
{sample['system']}<|im_end|>
<|im_start|>user
{sample['user']}<|im_end|>
<|im_start|>assistant
{sample['assistant']}<|im_end|>"""
        
        formatted.append({'text': text})
    
    dataset = Dataset.from_list(formatted)
    
    def tokenize(examples):
        return tokenizer(
            examples['text'],
            truncation=True,
            max_length=2048,
            padding='max_length',
        )
    
    tokenized = dataset.map(tokenize, batched=True, remove_columns=['text'])
    return tokenized


def train(
    data_path: str,
    output_dir: str,
    model_name: str = "Qwen/Qwen2.5-0.5B-Instruct",
    epochs: int = 3,
    batch_size: int = 4,
    learning_rate: float = 2e-5,
):
    """Run SFT training."""
    logger.info("=" * 60)
    logger.info("BABYLON SFT TRAINING")
    logger.info("=" * 60)
    logger.info(f"Model: {model_name}")
    logger.info(f"Data: {data_path}")
    logger.info(f"Output: {output_dir}")
    logger.info(f"Epochs: {epochs}")
    logger.info("=" * 60)
    
    # Check for GPU
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    logger.info(f"Device: {device}")
    
    # Load data
    logger.info("Loading training data...")
    samples = load_training_data(data_path)
    
    if len(samples) < 10:
        logger.error(f"Not enough high-quality samples: {len(samples)}")
        return None
    
    # Load tokenizer and model
    logger.info(f"Loading model: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        trust_remote_code=True,
    )
    
    if device == "mps":
        model = model.to(device)
    
    # Prepare dataset
    logger.info("Preparing dataset...")
    train_dataset = format_for_training(samples, tokenizer)
    
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
        fp16=device == "cuda",
        report_to="none",
        remove_unused_columns=False,
    )
    
    # Data collator
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        data_collator=data_collator,
    )
    
    # Train
    logger.info("Starting training...")
    start_time = datetime.now()
    
    trainer.train()
    
    duration = datetime.now() - start_time
    logger.info(f"Training completed in {duration}")
    
    # Save model
    logger.info(f"Saving model to {output_dir}")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save training info
    info = {
        "base_model": model_name,
        "training_samples": len(samples),
        "epochs": epochs,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "duration_seconds": duration.total_seconds(),
        "trained_at": datetime.now().isoformat(),
    }
    
    with open(os.path.join(output_dir, "training_info.json"), 'w') as f:
        json.dump(info, f, indent=2)
    
    logger.info("=" * 60)
    logger.info("TRAINING COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Model saved to: {output_dir}")
    
    return output_dir


def main():
    parser = argparse.ArgumentParser(description="SFT Training Script")
    parser.add_argument(
        '--data', 
        type=str, 
        default='trained_models/training_data.json',
        help='Path to training data JSON'
    )
    parser.add_argument(
        '--output', 
        type=str, 
        default='trained_models/sft_model',
        help='Output directory for trained model'
    )
    parser.add_argument(
        '--model', 
        type=str, 
        default='Qwen/Qwen2.5-0.5B-Instruct',
        help='Base model to fine-tune'
    )
    parser.add_argument(
        '--epochs', 
        type=int, 
        default=3,
        help='Number of training epochs'
    )
    parser.add_argument(
        '--batch-size', 
        type=int, 
        default=4,
        help='Training batch size'
    )
    parser.add_argument(
        '--lr', 
        type=float, 
        default=2e-5,
        help='Learning rate'
    )
    
    args = parser.parse_args()
    
    train(
        data_path=args.data,
        output_dir=args.output,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
    )


if __name__ == "__main__":
    main()

