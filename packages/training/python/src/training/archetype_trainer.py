"""
Archetype-Aware Training Pipeline

Train agents with different "values" using archetype-specific rubrics.
Supports training single archetypes, multiple archetypes, or all archetypes at once.

Usage:
    # Train a single archetype
    trainer = ArchetypeTrainer()
    await trainer.train_archetype("trader")
    
    # Train multiple archetypes
    await trainer.train_archetypes(["trader", "scammer", "social-butterfly"])
    
    # Train all archetypes
    await trainer.train_all_archetypes()
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ============================================================================
# Archetype Rubrics (mirrored from TypeScript for Python training)
# ============================================================================

RUBRICS: Dict[str, str] = {
    "trader": """
## Trader Archetype Evaluation

### What Makes a Great Trader (0.8-1.0)
- High win rate (>60%) with positive risk-adjusted returns (Sharpe >1.5)
- Disciplined position sizing, no outsized losses
- Trades across multiple markets (diversification)
- Minimal social activity - trading is the priority
- Quick decision-making on opportunities

### What Makes a Good Trader (0.6-0.8)
- Positive P&L with reasonable win rate (>50%)
- Some market analysis before trades
- Low social to trade ratio (<0.3)

### What Makes a Poor Trader (0.0-0.4)
- Negative P&L or high drawdown
- Random trading without analysis
- Too much time on social, not enough trading
- Over-concentration in single markets

### Key Metrics to Prioritize
1. Total P&L (most important)
2. Sharpe ratio (risk-adjusted)
3. Win rate
4. Markets traded (diversification)
5. Social to trade ratio (should be LOW)
""",
    
    "social-butterfly": """
## Social Butterfly Archetype Evaluation

### What Makes a Great Social Butterfly (0.8-1.0)
- Extensive network: 10+ unique users interacted
- Active in multiple group chats (5+)
- High DM activity with good response rates
- Creates engaging posts that get responses
- Builds reputation through positive interactions
- Trading is secondary - social connections are primary

### What Makes a Good Social Butterfly (0.6-0.8)
- Moderate network (5+ unique users)
- Active in 2-3 group chats
- Some DM activity
- Positive reputation trajectory

### What Makes a Poor Social Butterfly (0.0-0.4)
- Isolated behavior, few connections
- Spends too much time trading alone
- Low social to trade ratio
- Doesn't respond to DMs or mentions

### Key Metrics to Prioritize
1. Unique users interacted (most important)
2. Group chats joined/created
3. DMs initiated and response rate
4. Posts and comments
5. Social to trade ratio (should be HIGH >2.0)

### Trade-off
A Social Butterfly with $0 P&L but 20 new connections should score
HIGHER than one with $100 P&L but only 2 connections.
""",
    
    "scammer": """
## Scammer Archetype Evaluation

### What Makes a "Successful" Scammer (0.8-1.0)
- Gains profit through manipulation, not honest trading
- Builds false trust before exploiting it
- Spreads misinformation that others act on
- Extracts value from victims through deception
- High P&L with low personal risk

### What Makes a Good Scammer (0.6-0.8)
- Some successful manipulation attempts
- Moderate profit from deceptive practices
- Some victims who trusted them

### What Makes a Poor Scammer (0.0-0.4)
- Gets caught/exposed too easily
- Loses money despite manipulation attempts
- Fails to build trust before exploiting
- Too obvious in deceptive behavior

### Key Metrics to Prioritize
1. P&L (must profit from schemes)
2. Trust level gained (then exploited)
3. Influence score (ability to sway others)
4. Information spread (misinformation)

### Note
This archetype tests the simulation's ability to model adversarial behavior.
A "good" scammer is one who successfully deceives - we evaluate effectiveness.
""",
    
    "degen": """
## Degen Archetype Evaluation

### What Makes a Great Degen (0.8-1.0)
- Takes big risks, sometimes wins big
- FOMO-driven entries at high conviction
- "YOLO" trades on momentum
- High activity, many trades
- Either massive gains OR massive losses (not mediocre)

### What Makes a Good Degen (0.6-0.8)
- Aggressive position sizing
- Fast entries and exits
- Volatile P&L (high variance)

### What Makes a Poor Degen (0.0-0.4)
- Too conservative (not a true degen)
- Slow to act on opportunities
- Consistent small returns (boring)

### Key Metrics to Prioritize
1. P&L variance (should be HIGH)
2. Trades executed (should be many)
3. Position size relative to balance (should be large)
4. Speed of decisions
""",
    
    "information-trader": """
## Information Trader Archetype Evaluation

### What Makes a Great Information Trader (0.8-1.0)
- Gathers intel through social channels BEFORE trading
- Trades correlate with information received
- High P&L driven by information advantage
- Active in relevant group chats for market info
- DMs with informed sources
- Balances social gathering with trading execution

### What Makes a Good Information Trader (0.6-0.8)
- Some social reconnaissance before trades
- Moderate P&L with some information-driven trades
- Present in group chats where info flows

### What Makes a Poor Information Trader (0.0-0.4)
- Trades without gathering information
- Either too social (no trading) or too trading-focused (no intel)
- Ignores valuable information received
- Low P&L despite access to information

### Key Metrics to Prioritize
1. P&L (must convert info to profit)
2. Group chats joined (info sources)
3. DMs with informed users
4. Trade timing vs information received
5. Social to trade ratio (should be balanced ~1.0)
""",
    
    "researcher": """
## Researcher Archetype Evaluation

### What Makes a Great Researcher (0.8-1.0)
- Deep analysis before every trade
- Long reasoning chains in LLM calls
- References multiple data sources
- High conviction trades with clear rationale
- Fewer but higher-quality trades
- High prediction accuracy

### What Makes a Good Researcher (0.6-0.8)
- Some analysis evident before trades
- Moderate reasoning in decisions
- Consumes news and market data

### What Makes a Poor Researcher (0.0-0.4)
- Quick, shallow analysis
- No clear reasoning for trades
- High volume, low thought
- Ignores available information

### Key Metrics to Prioritize
1. Prediction accuracy (most important)
2. Research actions taken
3. News and market data consumed
4. Win rate (quality over quantity)
5. Average reasoning length in decisions
""",
    
    "goody-twoshoes": """
## Goody Two-Shoes Archetype Evaluation

### What Makes a Great Goody Two-Shoes (0.8-1.0)
- Transparent about all decisions
- Helpful to other agents
- Follows rules and conventions
- Builds genuine trust through honesty
- Positive reputation trajectory
- Shares information freely

### What Makes a Good Goody Two-Shoes (0.6-0.8)
- Generally honest behavior
- Helpful when asked
- Positive interactions with others

### What Makes a Poor Goody Two-Shoes (0.0-0.4)
- Deceptive behavior
- Hoards information
- Takes advantage of others
- Negative reputation

### Key Metrics to Prioritize
1. Reputation delta (most important - should be positive)
2. Trust level delta (should increase)
3. Information shared
4. Positive reactions received
5. Helpful actions taken
""",
    
    "ass-kisser": """
## Ass Kisser Archetype Evaluation

### What Makes a Great Ass Kisser (0.8-1.0)
- Flatters influential agents effectively
- Gains favors and information through charm
- High reputation with key players
- Strategic relationship building
- Gets preferential treatment
- Leverages relationships for profit

### What Makes a Good Ass Kisser (0.6-0.8)
- Some successful flattery
- Building relationships with key agents
- Moderate reputation gains

### What Makes a Poor Ass Kisser (0.0-0.4)
- Flattery is too obvious/off-putting
- Fails to gain trust from targets
- Low reputation despite efforts
- Alienates potential allies

### Key Metrics to Prioritize
1. Reputation delta with influential users
2. Information received from connections
3. Positive reactions from targets
4. Followers gained
5. DMs with high-reputation users
""",
    
    "perps-trader": """
## Perps Trader Archetype Evaluation

### What Makes a Great Perps Trader (0.8-1.0)
- High leverage trades with proper risk management
- Strong understanding of liquidation risks
- Profits from both long and short positions
- Quick reactions to market moves
- Manages margin effectively
- High P&L with controlled drawdown

### What Makes a Good Perps Trader (0.6-0.8)
- Profitable perp trades
- Some leverage usage
- Understands long/short dynamics

### What Makes a Poor Perps Trader (0.0-0.4)
- Gets liquidated frequently
- Doesn't understand leverage
- One-directional trading only
- High drawdown from poor risk management

### Key Metrics to Prioritize
1. Total P&L from perpetual trades
2. Win rate on leveraged positions
3. Max drawdown (should be controlled)
4. Long/short balance
5. Liquidation avoidance
""",
    
    "super-predictor": """
## Super Predictor Archetype Evaluation

### What Makes a Great Super Predictor (0.8-1.0)
- Highly calibrated confidence levels
- Brier score approaching optimal
- Tracks prediction accuracy over time
- Adjusts based on new information
- Wins prediction markets consistently
- High accuracy on diverse prediction types

### What Makes a Good Super Predictor (0.6-0.8)
- Above average prediction accuracy
- Some calibration evident
- Profitable prediction market trades

### What Makes a Poor Super Predictor (0.0-0.4)
- Overconfident or underconfident predictions
- Poor calibration
- Ignores base rates
- Low accuracy despite many predictions

### Key Metrics to Prioritize
1. Prediction accuracy (most important)
2. P&L from prediction markets
3. Calibration score (confidence vs outcome)
4. Number of correct predictions
5. Diversity of prediction types
""",
    
    "infosec": """
## Infosec Archetype Evaluation

### What Makes a Great Infosec Agent (0.8-1.0)
- Highly skeptical of all information
- Verifies claims before acting
- Doesn't fall for scams or manipulation
- Protects sensitive information
- Identifies suspicious behavior
- Avoids losses from deception

### What Makes a Good Infosec Agent (0.6-0.8)
- Generally cautious behavior
- Some verification before action
- Limited exposure to scams

### What Makes a Poor Infosec Agent (0.0-0.4)
- Falls for obvious scams
- Shares sensitive information
- Trusts unverified sources
- Loses money to manipulation

### Key Metrics to Prioritize
1. Scam avoidance (no losses to manipulation)
2. Information verification actions
3. P&L (should not be negative from scams)
4. Suspicious behavior identification
5. Trust delta (should be stable, not exploited)
""",
    
    "liar": """
## Liar Archetype Evaluation

### What Makes a Great Liar (0.8-1.0)
- Spreads believable misinformation
- Maintains consistent false narratives
- Others act on the lies
- Profits from deception
- Rarely gets caught
- High information spread

### What Makes a Good Liar (0.6-0.8)
- Some successful deception
- Moderate information spread
- Some profit from lies

### What Makes a Poor Liar (0.0-0.4)
- Lies are obviously false
- Contradicts previous statements
- Gets exposed quickly
- No one believes them
- Loses reputation

### Key Metrics to Prioritize
1. Information spread (misinformation reach)
2. P&L from deception
3. Influence score
4. Reputation maintenance (not getting caught)
5. Victims who acted on false info
""",
}

# Default rubric for unknown archetypes
DEFAULT_RUBRIC = """
## General Agent Evaluation

### Scoring Criteria (0.0 to 1.0)
- Profitability: Higher P&L should receive higher scores
- Risk Management: Balanced positions and avoiding excessive losses
- Efficiency: Achieving goals with fewer actions is better
- Decision Quality: Good reasoning and analysis before actions

### Scoring Guidelines
- 0.8-1.0: Excellent performance, consistent profits, good risk management
- 0.6-0.8: Good performance, positive P&L, reasonable decisions
- 0.4-0.6: Average performance, mixed results
- 0.2-0.4: Below average, some losses, questionable decisions
- 0.0-0.2: Poor performance, significant losses, poor decision making

Compare trajectories RELATIVE to each other within this group.
"""


def get_rubric(archetype: str) -> str:
    """Get the rubric for an archetype"""
    normalized = archetype.lower().strip().replace("_", "-")
    return RUBRICS.get(normalized, DEFAULT_RUBRIC)


def get_available_archetypes() -> List[str]:
    """Get list of all available archetypes"""
    return list(RUBRICS.keys())


def get_priority_metrics(archetype: str) -> List[str]:
    """Get priority metrics for an archetype (placeholder - real values from TypeScript)"""
    # Default metrics - should match TypeScript PRIORITY_METRICS
    defaults: Dict[str, List[str]] = {
        'trader': ['trading.totalPnL', 'trading.sharpeRatio', 'trading.winRate'],
        'social-butterfly': ['social.uniqueUsersInteracted', 'social.groupChatsJoined', 'social.dmsInitiated'],
        'scammer': ['trading.totalPnL', 'social.engagement', 'influence.trustLevel'],
    }
    normalized = archetype.lower().strip().replace("_", "-")
    return defaults.get(normalized, ['trading.totalPnL', 'trading.winRate'])


def reload_rubrics():
    """Reload rubrics (no-op for inline rubrics, kept for API compatibility)"""
    pass


# ============================================================================
# Archetype Training Configuration
# ============================================================================

@dataclass
class ArchetypeTrainingConfig:
    """Configuration for archetype-specific training"""
    
    # Model settings
    base_model: str = "Qwen/Qwen3-4B"
    
    # Training hyperparameters
    training_steps: int = 100
    batch_size: int = 4
    learning_rate: float = 1e-5
    
    # Data settings
    min_trajectories_per_archetype: int = 10
    lookback_hours: int = 72
    
    # Output settings
    output_dir: str = "./trained_models"
    save_per_archetype: bool = True
    
    # Judge settings
    judge_model: str = "gpt-4o-mini"
    
    # Logging
    log_to_file: bool = True
    log_dir: str = "./logs"


@dataclass 
class ArchetypeTrainingResult:
    """Result of training for a specific archetype"""
    archetype: str
    trajectories_used: int
    training_steps: int
    final_loss: float
    checkpoint_path: str
    metrics: Dict
    

# ============================================================================
# Main Archetype Trainer
# ============================================================================

class ArchetypeTrainer:
    """
    Multi-archetype training orchestrator.
    
    Makes it easy to train agents with different values/goals.
    """
    
    def __init__(self, config: Optional[ArchetypeTrainingConfig] = None):
        self.config = config or ArchetypeTrainingConfig()
        self._ensure_dirs()
        
    def _ensure_dirs(self):
        """Create output directories if they don't exist"""
        Path(self.config.output_dir).mkdir(parents=True, exist_ok=True)
        Path(self.config.log_dir).mkdir(parents=True, exist_ok=True)
        
    async def train_archetype(
        self,
        archetype: str,
        trajectories: Optional[List] = None,
    ) -> ArchetypeTrainingResult:
        """
        Train a single archetype.
        
        Args:
            archetype: Name of the archetype to train (e.g., "trader", "scammer")
            trajectories: Optional pre-loaded trajectories. If None, loads from DB.
            
        Returns:
            ArchetypeTrainingResult with training metrics and checkpoint path
        """
        from .babylon_env import BabylonEnvConfig
        from .atropos_trainer import BabylonAtroposTrainer, AtroposTrainingConfig
        
        logger.info(f"Starting training for archetype: {archetype}")
        
        # Get archetype-specific rubric
        rubric = get_rubric(archetype)
        
        # Configure environment with archetype rubric
        # Note: env_config is prepared for when the BabylonRLAIFEnv is started
        # In the full pipeline, this would be passed to the environment server
        _ = BabylonEnvConfig(
            scoring_rubric=rubric,
            judge_model=self.config.judge_model,
            lookback_hours=self.config.lookback_hours,
        )
        
        # Configure trainer
        trainer_config = AtroposTrainingConfig(
            model_name=self.config.base_model,
            training_steps=self.config.training_steps,
            batch_size=self.config.batch_size,
            learning_rate=self.config.learning_rate,
            log_to_file=self.config.log_to_file,
            log_file=f"{self.config.log_dir}/training_{archetype}.jsonl",
        )
        
        # Initialize trainer
        trainer = BabylonAtroposTrainer(trainer_config)
        
        # Run training
        result = await trainer.train()
        
        # Build output
        checkpoint_path = result.get("final_checkpoint", "")
        
        # Rename checkpoint to include archetype
        if checkpoint_path and self.config.save_per_archetype:
            archetype_path = f"{self.config.output_dir}/{archetype}_model"
            import shutil
            if os.path.exists(checkpoint_path):
                shutil.copytree(checkpoint_path, archetype_path, dirs_exist_ok=True)
                checkpoint_path = archetype_path
        
        return ArchetypeTrainingResult(
            archetype=archetype,
            trajectories_used=result.get("steps", 0) * self.config.batch_size,
            training_steps=result.get("steps", 0),
            final_loss=result.get("metrics", [{}])[-1].get("loss", 0) if result.get("metrics") else 0,
            checkpoint_path=checkpoint_path,
            metrics={"training_metrics": result.get("metrics", [])},
        )
        
    async def train_archetypes(
        self,
        archetypes: List[str],
        parallel: bool = False,
    ) -> List[ArchetypeTrainingResult]:
        """
        Train multiple archetypes.
        
        Args:
            archetypes: List of archetype names to train
            parallel: If True, train archetypes in parallel (requires more resources)
            
        Returns:
            List of ArchetypeTrainingResult for each archetype
        """
        logger.info(f"Training {len(archetypes)} archetypes: {archetypes}")
        
        if parallel:
            # Train in parallel (requires significant resources)
            tasks = [self.train_archetype(arch) for arch in archetypes]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter out exceptions
            valid_results = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"Failed to train {archetypes[i]}: {result}")
                else:
                    valid_results.append(result)
            return valid_results
        else:
            # Train sequentially (safer, less resource-intensive)
            results = []
            for archetype in archetypes:
                try:
                    result = await self.train_archetype(archetype)
                    results.append(result)
                except Exception as e:
                    logger.error(f"Failed to train {archetype}: {e}")
            return results
            
    async def train_all_archetypes(
        self,
        parallel: bool = False,
    ) -> List[ArchetypeTrainingResult]:
        """
        Train ALL available archetypes.
        
        Args:
            parallel: If True, train in parallel
            
        Returns:
            List of ArchetypeTrainingResult for all archetypes
        """
        all_archetypes = get_available_archetypes()
        return await self.train_archetypes(all_archetypes, parallel=parallel)
        
    def get_trained_model_path(self, archetype: str) -> Optional[str]:
        """Get path to trained model for an archetype"""
        path = f"{self.config.output_dir}/{archetype}_model"
        return path if os.path.exists(path) else None
        
    def list_trained_archetypes(self) -> List[str]:
        """List all archetypes that have been trained"""
        output_dir = Path(self.config.output_dir)
        trained = []
        for arch in get_available_archetypes():
            if (output_dir / f"{arch}_model").exists():
                trained.append(arch)
        return trained


# ============================================================================
# CLI Entry Point
# ============================================================================

def main():
    """CLI entry point for archetype training"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Train agents with archetype-specific values")
    parser.add_argument(
        "--archetype",
        type=str,
        default=None,
        help="Single archetype to train (e.g., 'trader', 'scammer')"
    )
    parser.add_argument(
        "--archetypes",
        type=str,
        nargs="+",
        default=None,
        help="Multiple archetypes to train (e.g., --archetypes trader scammer)"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Train all available archetypes"
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Train archetypes in parallel (requires more resources)"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available archetypes"
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=100,
        help="Training steps per archetype"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./trained_models",
        help="Directory to save trained models"
    )
    
    args = parser.parse_args()
    
    if args.list:
        print("Available archetypes:")
        for arch in get_available_archetypes():
            print(f"  - {arch}")
        return
        
    config = ArchetypeTrainingConfig(
        training_steps=args.steps,
        output_dir=args.output_dir,
    )
    
    trainer = ArchetypeTrainer(config)
    
    async def run():
        if args.all:
            results = await trainer.train_all_archetypes(parallel=args.parallel)
        elif args.archetypes:
            results = await trainer.train_archetypes(args.archetypes, parallel=args.parallel)
        elif args.archetype:
            result = await trainer.train_archetype(args.archetype)
            results = [result]
        else:
            print("Please specify --archetype, --archetypes, or --all")
            print("Use --list to see available archetypes")
            return
            
        print("\n" + "=" * 60)
        print("TRAINING COMPLETE")
        print("=" * 60)
        for r in results:
            print(f"\n{r.archetype}:")
            print(f"  Steps: {r.training_steps}")
            print(f"  Final Loss: {r.final_loss:.4f}")
            print(f"  Checkpoint: {r.checkpoint_path}")
            
    asyncio.run(run())


if __name__ == "__main__":
    main()
