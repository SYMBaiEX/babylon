#!/usr/bin/env python3
"""
Export Babylon Trajectories to HuggingFace Datasets

Converts trajectory data from PostgreSQL into HuggingFace-compatible preference
datasets for RLHF/DPO training and public release.

Output formats:
1. Preference pairs (chosen/rejected) - for DPO/RLHF
2. Single trajectory SFT - for supervised fine-tuning
3. Raw trajectories - full data for analysis

Usage:
    # Export to local parquet files
    python scripts/trajectories_to_hf_dataset.py --output ./hf_dataset
    
    # Export and push to HuggingFace Hub
    python scripts/trajectories_to_hf_dataset.py --push-to-hub babylonlabs/babylon-trading-v1
    
    # Export only preference pairs
    python scripts/trajectories_to_hf_dataset.py --format preferences --output ./preferences
    
    # Limit export size
    python scripts/trajectories_to_hf_dataset.py --max-pairs 10000 --output ./subset

Environment:
    DATABASE_URL: PostgreSQL connection string
    HF_TOKEN: HuggingFace API token (for --push-to-hub)
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@dataclass
class ExportConfig:
    """Configuration for HuggingFace export."""
    database_url: str = ""
    output_dir: str = "./hf_export"
    push_to_hub: Optional[str] = None  # e.g., "babylonlabs/babylon-trading-v1"
    
    # Data selection
    lookback_hours: int = 720  # 30 days
    min_actions: int = 3
    max_trajectories: int = 50000
    max_pairs: Optional[int] = None  # Limit preference pairs
    
    # Format options
    format: str = "all"  # "preferences", "sft", "raw", "all"
    include_metadata: bool = True
    
    # Filtering
    min_pnl_diff: float = 0.0  # Minimum PnL difference for preference pairs
    archetypes: Optional[List[str]] = None  # Filter by archetype
    
    def __post_init__(self):
        if not self.database_url:
            self.database_url = os.environ.get("DATABASE_URL", "")


@dataclass
class TrajectoryData:
    """Parsed trajectory data."""
    trajectory_id: str
    agent_id: str
    agent_name: str
    window_id: str
    scenario_id: Optional[str]
    archetype: str
    steps: List[Dict[str, Any]]
    final_pnl: float
    final_balance: Optional[float]
    episode_length: int
    total_reward: float
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None


@dataclass
class PreferencePair:
    """A preference pair for DPO/RLHF training."""
    prompt: str
    chosen: str
    rejected: str
    chosen_score: float
    rejected_score: float
    window_id: str
    scenario_id: Optional[str]
    archetype_chosen: str
    archetype_rejected: str
    pnl_diff: float
    metadata: Dict[str, Any] = field(default_factory=dict)


def format_step_as_message(step: Dict[str, Any]) -> Tuple[str, str]:
    """
    Format a trajectory step as system/user context and assistant response.
    
    Returns:
        (context_text, response_text)
    """
    observation = step.get("observation", {})
    action = step.get("action", {})
    
    # Build context from observation
    context_parts = []
    
    # Market state
    market = observation.get("market", {})
    if market:
        context_parts.append(f"**Market State:**")
        context_parts.append(f"- Price: ${market.get('price', 'N/A')}")
        context_parts.append(f"- 24h Change: {market.get('priceChange24h', 'N/A')}%")
        context_parts.append(f"- Volume: ${market.get('volume24h', 'N/A')}")
    
    # Portfolio state
    portfolio = observation.get("portfolio", {})
    if portfolio:
        context_parts.append(f"\n**Your Portfolio:**")
        context_parts.append(f"- Balance: ${portfolio.get('balance', 'N/A')}")
        context_parts.append(f"- Holdings: {portfolio.get('holdings', {})}")
        context_parts.append(f"- Total Value: ${portfolio.get('totalValue', 'N/A')}")
    
    # Social context
    recent_posts = observation.get("recentPosts", [])
    if recent_posts:
        context_parts.append(f"\n**Recent Social Activity:** {len(recent_posts)} posts")
    
    # Task/Scenario
    task = observation.get("task", observation.get("scenario", ""))
    if task:
        context_parts.append(f"\n**Current Task:** {task}")
    
    context = "\n".join(context_parts) if context_parts else "Market observation available."
    
    # Build response from action
    action_type = action.get("type", action.get("action", "unknown"))
    parameters = action.get("parameters", {})
    reasoning = action.get("reasoning", parameters.get("reasoning", ""))
    
    response_parts = []
    if reasoning:
        response_parts.append(f"**Reasoning:** {reasoning}")
    
    response_parts.append(f"\n**Action:** {action_type}")
    
    # Action-specific details
    if action_type in ["BUY", "SELL", "buy", "sell"]:
        amount = parameters.get("amount", parameters.get("quantity", "N/A"))
        asset = parameters.get("asset", parameters.get("token", "N/A"))
        response_parts.append(f"- Asset: {asset}")
        response_parts.append(f"- Amount: {amount}")
    elif action_type in ["POST", "post"]:
        content = parameters.get("content", parameters.get("message", ""))
        response_parts.append(f"- Content: {content[:200]}...")
    elif action_type in ["HOLD", "hold", "WAIT", "wait"]:
        response_parts.append("- Waiting for better opportunity")
    
    response = "\n".join(response_parts)
    
    return context, response


def trajectory_to_conversation(traj: TrajectoryData, max_steps: int = 10) -> List[Dict[str, str]]:
    """
    Convert a trajectory to a multi-turn conversation format.
    
    Returns list of messages suitable for chat template.
    """
    messages = []
    
    # System prompt based on archetype
    archetype_prompts = {
        "trader": "You are a crypto trader focused on maximizing returns through strategic trades.",
        "hodler": "You are a long-term crypto investor who prefers holding through volatility.",
        "analyst": "You are a crypto analyst who makes decisions based on technical and fundamental analysis.",
        "degen": "You are an aggressive crypto trader willing to take high-risk positions for potential high rewards.",
        "conservative": "You are a conservative crypto investor focused on capital preservation.",
        "default": "You are an AI trading agent in a crypto simulation.",
    }
    
    system_prompt = archetype_prompts.get(traj.archetype.lower(), archetype_prompts["default"])
    system_prompt += f"\n\nYour goal is to make profitable trading decisions based on market conditions."
    
    messages.append({
        "role": "system",
        "content": system_prompt
    })
    
    # Convert steps to conversation turns
    steps_to_use = traj.steps[:max_steps] if len(traj.steps) > max_steps else traj.steps
    
    for i, step in enumerate(steps_to_use):
        context, response = format_step_as_message(step)
        
        # User turn (observation/context)
        messages.append({
            "role": "user",
            "content": f"Step {i+1}/{len(steps_to_use)}:\n\n{context}\n\nWhat action do you take?"
        })
        
        # Assistant turn (action)
        messages.append({
            "role": "assistant",
            "content": response
        })
    
    return messages


def conversation_to_text(messages: List[Dict[str, str]]) -> Tuple[str, str]:
    """
    Convert messages to prompt and completion text.
    
    Returns:
        (prompt, completion) where completion is the last assistant message
    """
    if not messages:
        return "", ""
    
    # Find last assistant message
    last_assistant_idx = None
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "assistant":
            last_assistant_idx = i
            break
    
    if last_assistant_idx is None:
        # No assistant message
        prompt = "\n\n".join([f"[{m['role']}]: {m['content']}" for m in messages])
        return prompt, ""
    
    # Build prompt from all messages before last assistant
    prompt_parts = []
    for m in messages[:last_assistant_idx]:
        role_prefix = {"system": "[System]", "user": "[User]", "assistant": "[Assistant]"}.get(m["role"], f"[{m['role']}]")
        prompt_parts.append(f"{role_prefix}: {m['content']}")
    
    prompt = "\n\n".join(prompt_parts)
    if messages[last_assistant_idx - 1]["role"] == "user":
        prompt += "\n\n[Assistant]:"
    
    completion = messages[last_assistant_idx]["content"]
    
    return prompt, completion


async def fetch_trajectories(config: ExportConfig) -> List[TrajectoryData]:
    """Fetch trajectories from PostgreSQL database."""
    try:
        import asyncpg
    except ImportError:
        raise ImportError("asyncpg required: pip install asyncpg")
    
    logger.info(f"Connecting to database...")
    
    pool = await asyncpg.create_pool(
        config.database_url,
        min_size=2,
        max_size=10,
        command_timeout=120,
        statement_cache_size=0,  # For pooler compatibility
    )
    
    async with pool.acquire() as conn:
        logger.info(f"Fetching trajectories (lookback={config.lookback_hours}h, max={config.max_trajectories})...")
        
        rows = await conn.fetch("""
            SELECT 
                t."trajectoryId",
                t."agentId",
                t."windowId",
                t."scenarioId",
                t."stepsJson",
                t."metadataJson",
                t."finalPnL",
                t."finalBalance",
                t."episodeLength",
                t."totalReward",
                t."archetype",
                t."createdAt",
                u.username as agent_name
            FROM trajectories t
            LEFT JOIN "User" u ON t."agentId" = u.id
            WHERE 
                t."createdAt" > NOW() - $1::interval
                AND t."stepsJson" IS NOT NULL
                AND t."stepsJson"::text != 'null'
                AND t."stepsJson"::text != '[]'
                AND t."episodeLength" >= $2
            ORDER BY t."createdAt" DESC
            LIMIT $3
        """, timedelta(hours=config.lookback_hours), 
            config.min_actions,
            config.max_trajectories)
    
    await pool.close()
    
    logger.info(f"Fetched {len(rows)} trajectories")
    
    trajectories = []
    for row in rows:
        try:
            steps = json.loads(row['stepsJson'] or '[]')
        except json.JSONDecodeError:
            continue
        
        if len(steps) < config.min_actions:
            continue
        
        metadata = {}
        if row['metadataJson']:
            try:
                metadata = json.loads(row['metadataJson']) if isinstance(row['metadataJson'], str) else row['metadataJson']
            except json.JSONDecodeError:
                pass
        
        archetype = row['archetype'] or 'default'
        
        # Filter by archetype if specified
        if config.archetypes and archetype.lower() not in [a.lower() for a in config.archetypes]:
            continue
        
        trajectories.append(TrajectoryData(
            trajectory_id=row['trajectoryId'],
            agent_id=row['agentId'],
            agent_name=row['agent_name'] or row['agentId'][:8],
            window_id=row['windowId'],
            scenario_id=row['scenarioId'],
            archetype=archetype,
            steps=steps,
            final_pnl=float(row['finalPnL'] or 0),
            final_balance=float(row['finalBalance']) if row['finalBalance'] else None,
            episode_length=int(row['episodeLength'] or len(steps)),
            total_reward=float(row['totalReward'] or 0),
            metadata=metadata,
            created_at=row['createdAt'],
        ))
    
    logger.info(f"Parsed {len(trajectories)} valid trajectories")
    return trajectories


def create_preference_pairs(
    trajectories: List[TrajectoryData],
    config: ExportConfig,
) -> List[PreferencePair]:
    """
    Create preference pairs from trajectories in the same window/scenario.
    
    Uses final PnL as the preference signal.
    """
    # Group by window + scenario
    groups: Dict[str, List[TrajectoryData]] = {}
    for traj in trajectories:
        key = f"{traj.window_id}_{traj.scenario_id or 'default'}"
        if key not in groups:
            groups[key] = []
        groups[key].append(traj)
    
    pairs = []
    for group_key, group_trajs in groups.items():
        if len(group_trajs) < 2:
            continue
        
        # Sort by PnL descending
        sorted_trajs = sorted(group_trajs, key=lambda t: t.final_pnl, reverse=True)
        
        # Create pairs: best vs each worse
        for i, better in enumerate(sorted_trajs[:-1]):
            for worse in sorted_trajs[i+1:]:
                pnl_diff = better.final_pnl - worse.final_pnl
                
                if pnl_diff < config.min_pnl_diff:
                    continue
                
                # Convert to conversations
                better_msgs = trajectory_to_conversation(better)
                worse_msgs = trajectory_to_conversation(worse)
                
                # Get prompt and completions
                prompt_better, completion_better = conversation_to_text(better_msgs)
                prompt_worse, completion_worse = conversation_to_text(worse_msgs)
                
                # Use the better trajectory's prompt as the shared prompt
                # (they should be similar since same window/scenario)
                pairs.append(PreferencePair(
                    prompt=prompt_better,
                    chosen=completion_better,
                    rejected=completion_worse,
                    chosen_score=better.final_pnl,
                    rejected_score=worse.final_pnl,
                    window_id=better.window_id,
                    scenario_id=better.scenario_id,
                    archetype_chosen=better.archetype,
                    archetype_rejected=worse.archetype,
                    pnl_diff=pnl_diff,
                    metadata={
                        "chosen_trajectory_id": better.trajectory_id,
                        "rejected_trajectory_id": worse.trajectory_id,
                        "chosen_episode_length": better.episode_length,
                        "rejected_episode_length": worse.episode_length,
                    }
                ))
                
                if config.max_pairs and len(pairs) >= config.max_pairs:
                    logger.info(f"Reached max pairs limit: {config.max_pairs}")
                    return pairs
    
    logger.info(f"Created {len(pairs)} preference pairs from {len(groups)} groups")
    return pairs


def create_sft_dataset(trajectories: List[TrajectoryData]) -> List[Dict[str, Any]]:
    """Create SFT dataset from trajectories."""
    sft_data = []
    
    for traj in trajectories:
        messages = trajectory_to_conversation(traj)
        prompt, completion = conversation_to_text(messages)
        
        sft_data.append({
            "prompt": prompt,
            "completion": completion,
            "messages": messages,
            "trajectory_id": traj.trajectory_id,
            "archetype": traj.archetype,
            "final_pnl": traj.final_pnl,
            "episode_length": traj.episode_length,
            "window_id": traj.window_id,
        })
    
    return sft_data


def create_raw_dataset(trajectories: List[TrajectoryData]) -> List[Dict[str, Any]]:
    """Create raw trajectory dataset for analysis."""
    raw_data = []
    
    for traj in trajectories:
        raw_data.append({
            "trajectory_id": traj.trajectory_id,
            "agent_id": traj.agent_id,
            "agent_name": traj.agent_name,
            "window_id": traj.window_id,
            "scenario_id": traj.scenario_id,
            "archetype": traj.archetype,
            "steps": traj.steps,
            "final_pnl": traj.final_pnl,
            "final_balance": traj.final_balance,
            "episode_length": traj.episode_length,
            "total_reward": traj.total_reward,
            "metadata": traj.metadata,
            "created_at": traj.created_at.isoformat() if traj.created_at else None,
        })
    
    return raw_data


def save_datasets(
    preferences: List[PreferencePair],
    sft_data: List[Dict[str, Any]],
    raw_data: List[Dict[str, Any]],
    config: ExportConfig,
):
    """Save datasets to disk using HuggingFace datasets."""
    try:
        from datasets import Dataset, DatasetDict
    except ImportError:
        raise ImportError("datasets required: pip install datasets")
    
    output_path = Path(config.output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    dataset_dict = {}
    
    # Preferences dataset
    if preferences and config.format in ["preferences", "all"]:
        pref_records = [
            {
                "prompt": p.prompt,
                "chosen": p.chosen,
                "rejected": p.rejected,
                "chosen_score": p.chosen_score,
                "rejected_score": p.rejected_score,
                "score_diff": p.pnl_diff,
                "window_id": p.window_id,
                "scenario_id": p.scenario_id or "",
                "archetype_chosen": p.archetype_chosen,
                "archetype_rejected": p.archetype_rejected,
                **(p.metadata if config.include_metadata else {}),
            }
            for p in preferences
        ]
        dataset_dict["preferences"] = Dataset.from_list(pref_records)
        logger.info(f"Created preferences split with {len(pref_records)} examples")
    
    # SFT dataset
    if sft_data and config.format in ["sft", "all"]:
        sft_records = [
            {
                "prompt": d["prompt"],
                "completion": d["completion"],
                "messages": json.dumps(d["messages"]),  # Serialize for Arrow
                "trajectory_id": d["trajectory_id"],
                "archetype": d["archetype"],
                "final_pnl": d["final_pnl"],
                "episode_length": d["episode_length"],
                "window_id": d["window_id"],
            }
            for d in sft_data
        ]
        dataset_dict["sft"] = Dataset.from_list(sft_records)
        logger.info(f"Created SFT split with {len(sft_records)} examples")
    
    # Raw dataset
    if raw_data and config.format in ["raw", "all"]:
        raw_records = [
            {
                "trajectory_id": d["trajectory_id"],
                "agent_id": d["agent_id"],
                "agent_name": d["agent_name"],
                "window_id": d["window_id"],
                "scenario_id": d["scenario_id"] or "",
                "archetype": d["archetype"],
                "steps": json.dumps(d["steps"]),  # Serialize for Arrow
                "final_pnl": d["final_pnl"],
                "final_balance": d["final_balance"] or 0.0,
                "episode_length": d["episode_length"],
                "total_reward": d["total_reward"],
                "metadata": json.dumps(d["metadata"]),
                "created_at": d["created_at"] or "",
            }
            for d in raw_data
        ]
        dataset_dict["raw"] = Dataset.from_list(raw_records)
        logger.info(f"Created raw split with {len(raw_records)} examples")
    
    if not dataset_dict:
        logger.warning("No datasets created!")
        return
    
    # Create DatasetDict
    full_dataset = DatasetDict(dataset_dict)
    
    # Save locally
    full_dataset.save_to_disk(str(output_path))
    logger.info(f"Saved dataset to {output_path}")
    
    # Also save as parquet for easy inspection
    for split_name, split_data in full_dataset.items():
        parquet_path = output_path / f"{split_name}.parquet"
        split_data.to_parquet(str(parquet_path))
        logger.info(f"Saved {split_name}.parquet")
    
    # Push to hub if requested
    if config.push_to_hub:
        push_to_huggingface(full_dataset, config)


def push_to_huggingface(dataset: "DatasetDict", config: ExportConfig):
    """Push dataset to HuggingFace Hub."""
    from huggingface_hub import HfApi
    
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        logger.warning("HF_TOKEN not set, skipping push to hub")
        return
    
    repo_id = config.push_to_hub
    logger.info(f"Pushing dataset to HuggingFace Hub: {repo_id}")
    
    # Create dataset card
    card_content = f"""---
license: mit
task_categories:
  - reinforcement-learning
  - text-generation
language:
  - en
tags:
  - trading
  - crypto
  - rlhf
  - preference-learning
  - babylon
pretty_name: Babylon Trading Trajectories
size_categories:
  - 1K<n<10K
---

# Babylon Trading Trajectories

AI trading agent trajectories from the Babylon simulation environment.

## Dataset Description

This dataset contains trajectories from AI agents trading in simulated crypto markets.
Each trajectory represents a sequence of observations and actions taken by an agent.

### Splits

- **preferences**: Preference pairs for DPO/RLHF training (chosen/rejected based on PnL)
- **sft**: Single trajectories formatted for supervised fine-tuning
- **raw**: Complete trajectory data for analysis

### Features

**Preferences split:**
- `prompt`: The market context and observation
- `chosen`: The action from the better-performing agent
- `rejected`: The action from the worse-performing agent
- `chosen_score`: Final PnL of chosen trajectory
- `rejected_score`: Final PnL of rejected trajectory
- `archetype_chosen/rejected`: Trading strategy archetype

**SFT split:**
- `prompt`: Conversation context
- `completion`: Agent's action/response
- `messages`: Full conversation in chat format
- `final_pnl`: Trading performance

**Raw split:**
- Full trajectory data including all steps and metadata

## Usage

```python
from datasets import load_dataset

# Load preferences for DPO training
dataset = load_dataset("{repo_id}", split="preferences")

# Load for SFT
sft_data = load_dataset("{repo_id}", split="sft")

# Load raw trajectories for analysis
raw = load_dataset("{repo_id}", split="raw")
```

## Training

These trajectories were collected from:
- Multiple trading archetypes (trader, hodler, analyst, degen, conservative)
- Various market conditions (bull, bear, sideways)
- Real-time market data from crypto exchanges

## License

MIT License

## Citation

```bibtex
@misc{{babylon-trading-2025,
  author = {{Babylon Labs}},
  title = {{Babylon Trading Trajectories}},
  year = {{2025}},
  publisher = {{HuggingFace}},
  url = {{https://huggingface.co/datasets/{repo_id}}}
}}
```
"""
    
    try:
        dataset.push_to_hub(
            repo_id,
            token=hf_token,
            private=False,
        )
        logger.info(f"Successfully pushed to {repo_id}")
        
        # Update README
        api = HfApi(token=hf_token)
        api.upload_file(
            path_or_fileobj=card_content.encode(),
            path_in_repo="README.md",
            repo_id=repo_id,
            repo_type="dataset",
        )
        logger.info("Updated dataset README")
        
    except Exception as e:
        logger.error(f"Failed to push to hub: {e}")
        raise


async def main():
    parser = argparse.ArgumentParser(description="Export Babylon trajectories to HuggingFace")
    parser.add_argument("--output", "-o", default="./hf_export", help="Output directory")
    parser.add_argument("--push-to-hub", help="HuggingFace repo ID to push to (e.g., 'org/dataset-name')")
    parser.add_argument("--format", choices=["preferences", "sft", "raw", "all"], default="all",
                        help="Output format(s)")
    parser.add_argument("--lookback-hours", type=int, default=720, help="Hours to look back")
    parser.add_argument("--min-actions", type=int, default=3, help="Minimum actions per trajectory")
    parser.add_argument("--max-trajectories", type=int, default=50000, help="Maximum trajectories to fetch")
    parser.add_argument("--max-pairs", type=int, help="Maximum preference pairs to create")
    parser.add_argument("--min-pnl-diff", type=float, default=0.0, help="Minimum PnL diff for pairs")
    parser.add_argument("--archetypes", nargs="+", help="Filter by archetypes")
    parser.add_argument("--no-metadata", action="store_true", help="Exclude metadata from export")
    
    args = parser.parse_args()
    
    config = ExportConfig(
        output_dir=args.output,
        push_to_hub=args.push_to_hub,
        format=args.format,
        lookback_hours=args.lookback_hours,
        min_actions=args.min_actions,
        max_trajectories=args.max_trajectories,
        max_pairs=args.max_pairs,
        min_pnl_diff=args.min_pnl_diff,
        archetypes=args.archetypes,
        include_metadata=not args.no_metadata,
    )
    
    if not config.database_url:
        logger.error("DATABASE_URL environment variable not set")
        sys.exit(1)
    
    # Fetch trajectories
    trajectories = await fetch_trajectories(config)
    
    if not trajectories:
        logger.error("No trajectories found")
        sys.exit(1)
    
    # Create datasets based on format
    preferences = []
    sft_data = []
    raw_data = []
    
    if config.format in ["preferences", "all"]:
        preferences = create_preference_pairs(trajectories, config)
    
    if config.format in ["sft", "all"]:
        sft_data = create_sft_dataset(trajectories)
    
    if config.format in ["raw", "all"]:
        raw_data = create_raw_dataset(trajectories)
    
    # Save and optionally push
    save_datasets(preferences, sft_data, raw_data, config)
    
    # Print summary
    print("\n" + "="*60)
    print("EXPORT SUMMARY")
    print("="*60)
    print(f"Trajectories fetched: {len(trajectories)}")
    if preferences:
        print(f"Preference pairs: {len(preferences)}")
    if sft_data:
        print(f"SFT examples: {len(sft_data)}")
    if raw_data:
        print(f"Raw trajectories: {len(raw_data)}")
    print(f"Output directory: {config.output_dir}")
    if config.push_to_hub:
        print(f"Pushed to: https://huggingface.co/datasets/{config.push_to_hub}")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())

