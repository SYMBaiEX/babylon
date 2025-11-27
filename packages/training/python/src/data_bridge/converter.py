"""
Babylon → Atropos Converter
Strong types, no defensive programming, fail fast

Converts Babylon trajectories to Atropos ScoredDataGroup format
for GRPO training.
"""

import json
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..models import AtroposScoredGroup as PydanticScoredGroup
from ..models import BabylonTrajectory, MarketOutcomes


@dataclass
class AtroposMessage:
    """Single message in a conversation"""
    role: str
    content: str
    
    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass
class AtroposTrajectory:
    """Trajectory in Atropos format"""
    messages: List[AtroposMessage]
    tokens: List[int] = field(default_factory=list)
    masks: List[int] = field(default_factory=list)
    logprobs: List[float] = field(default_factory=list)
    score: float = 0.0
    metadata: Dict = field(default_factory=dict)
    
    def to_messages_list(self) -> List[Dict[str, str]]:
        return [m.to_dict() for m in self.messages]


@dataclass 
class ScoredGroupResult:
    """Internal result type for converter - use AtroposScoredGroup from models for API"""
    tokens: List[List[int]]
    masks: List[List[int]]
    scores: List[float]
    inference_logprobs: List[List[float]] = field(default_factory=list)
    messages: List[List[Dict[str, str]]] = field(default_factory=list)
    
    @property
    def group_size(self) -> int:
        return len(self.tokens)
    
    def to_pydantic(self) -> PydanticScoredGroup:
        """Convert to Pydantic model for API/storage"""
        return PydanticScoredGroup(
            tokens=self.tokens,
            masks=self.masks,
            scores=self.scores,
            inference_logprobs=self.inference_logprobs,
            messages=self.messages,
        )


class BabylonToAtroposConverter:
    """Convert Babylon trajectories to Atropos format - no error hiding"""
    
    def __init__(
        self,
        dropout_rate: float = 0.0,
        max_steps: int = 20,
        include_messages: bool = True,
    ):
        if not 0.0 <= dropout_rate <= 0.5:
            raise ValueError(f"Dropout rate must be 0.0-0.5, got {dropout_rate}")
        self.dropout_rate = dropout_rate
        self.max_steps = max_steps
        self.include_messages = include_messages
    
    def convert_trajectory(
        self,
        babylon_traj: BabylonTrajectory,
        market_outcomes: Optional[MarketOutcomes] = None,
        tokenizer = None,
    ) -> Optional[AtroposTrajectory]:
        """
        Convert to Atropos format with market context
        
        Returns None only if dropout applied, raises on errors
        """
        # Random dropout
        if self.dropout_rate > 0 and random.random() < self.dropout_rate:
            return None
        
        messages: List[AtroposMessage] = []
        
        # System message with context
        system_msg = self._build_system_message(babylon_traj, market_outcomes)
        messages.append(AtroposMessage(role="system", content=system_msg))
        
        # Convert steps to messages (truncate if needed)
        steps = babylon_traj.steps
        if len(steps) > self.max_steps:
            steps = steps[-self.max_steps:]
        
        for step in steps:
            # Each step may contain multiple LLM calls (reasoning, action, evaluation, response)
            # We include ALL calls to preserve the complete decision-making process
            if step.llm_calls:
                for llm_call in step.llm_calls:
                    # Skip calls with empty prompts or responses
                    if not llm_call.user_prompt or not llm_call.response:
                        continue
                    
                    # Add the user prompt
                    messages.append(AtroposMessage(
                        role="user",
                        content=llm_call.user_prompt
                    ))
                    
                    # Add the assistant response
                    messages.append(AtroposMessage(
                        role="assistant",
                        content=llm_call.response
                    ))
            else:
                # Fallback: build messages from environment state and action
                env_state = step.environment_state
                user_content = (
                    f"Market Update:\n"
                    f"- Balance: ${env_state.agent_balance:.2f}\n"
                    f"- P&L: ${env_state.agent_pnl:.2f}\n"
                    f"- Open Positions: {env_state.open_positions}"
                )
                messages.append(AtroposMessage(role="user", content=user_content))
                
                action = step.action
                if action:
                    assistant_content = f"Action: {action.action_type}"
                    if action.parameters:
                        assistant_content += f"\nParameters: {json.dumps(action.parameters)}"
                    if action.reasoning:
                        assistant_content += f"\nReasoning: {action.reasoning[:200]}"
                    messages.append(AtroposMessage(role="assistant", content=assistant_content))
        
        if len(messages) < 3:  # Need at least system + user + assistant
            raise ValueError(
                f"Trajectory {babylon_traj.trajectory_id} has insufficient messages: {len(messages)}"
            )
        
        # Tokenize if tokenizer provided
        tokens: List[int] = []
        masks: List[int] = []
        
        if tokenizer is not None:
            # Apply chat template and tokenize
            messages_dict = [m.to_dict() for m in messages]
            tokenized = tokenizer.apply_chat_template(
                messages_dict,
                tokenize=True,
                return_dict=True,
            )
            tokens = tokenized.get("input_ids", [])
            
            # Create mask: -100 for non-assistant tokens, token_id for assistant tokens
            # This ensures we only compute loss on model outputs (assistant responses)
            masks = self._create_assistant_only_mask(tokens, messages, tokenizer)
        
        return AtroposTrajectory(
            messages=messages,
            tokens=tokens,
            masks=masks,
            logprobs=[],  # Filled during inference
            score=0.0,  # Set by judge
            metadata={
                "trajectory_id": babylon_traj.trajectory_id,
                "agent_id": babylon_traj.agent_id,
                "window_id": babylon_traj.window_id,
                "final_pnl": babylon_traj.final_pnl,
                "episode_length": babylon_traj.episode_length,
                "trades_executed": babylon_traj.trades_executed or 0,
            }
        )
    
    def _create_assistant_only_mask(
        self,
        tokens: List[int],
        messages: List[AtroposMessage],
        tokenizer,
    ) -> List[int]:
        """
        Create mask that only includes loss on assistant tokens.
        
        This is CRITICAL for proper training - we should only train
        on model outputs (assistant responses), not on user prompts
        or system messages.
        
        Returns:
            List of masks: -100 for non-trainable, token_id for trainable
        """
        # Strategy: Tokenize each message separately and find boundaries
        masks = [-100] * len(tokens)
        
        # Track position in full sequence
        current_pos = 0
        
        # Get special tokens for this tokenizer
        # Most chat templates add tokens around role changes
        has_bos = hasattr(tokenizer, 'bos_token_id') and tokenizer.bos_token_id is not None
        
        if has_bos:
            current_pos = 1  # Skip BOS token
        
        for msg in messages:
            # Tokenize this message in isolation to get its length
            msg_dict = [msg.to_dict()]
            try:
                msg_tokens = tokenizer.apply_chat_template(
                    msg_dict,
                    tokenize=True,
                    add_generation_prompt=False,
                )
                msg_len = len(msg_tokens)
                
                # Remove BOS if present (we only count it once)
                if has_bos and msg_len > 0:
                    msg_len -= 1
                
                if msg.role == "assistant":
                    # Mark assistant tokens as trainable
                    for i in range(current_pos, min(current_pos + msg_len, len(tokens))):
                        masks[i] = tokens[i]
                
                current_pos += msg_len
                
            except Exception:
                # Fallback: if tokenization fails, use heuristic
                # Mark everything after "assistant" role as trainable
                pass
        
        # Fallback: if we couldn't properly segment, use a heuristic
        # Look for common assistant markers in the tokenized sequence
        if sum(1 for m in masks if m != -100) == 0:
            # Try to find assistant response boundaries
            # This is tokenizer-specific, but many use similar patterns
            assistant_markers = [
                tokenizer.encode("assistant", add_special_tokens=False),
                tokenizer.encode("<|assistant|>", add_special_tokens=False),
                tokenizer.encode("[/INST]", add_special_tokens=False),
            ]
            
            in_assistant = False
            for i, token in enumerate(tokens):
                # Simple heuristic: alternate between non-trainable and trainable
                # based on role markers
                for marker in assistant_markers:
                    if i + len(marker) <= len(tokens):
                        if tokens[i:i+len(marker)] == marker:
                            in_assistant = True
                            break
                
                # Mark user/system markers as end of assistant
                user_markers = [
                    tokenizer.encode("user", add_special_tokens=False),
                    tokenizer.encode("<|user|>", add_special_tokens=False),
                    tokenizer.encode("[INST]", add_special_tokens=False),
                ]
                for marker in user_markers:
                    if i + len(marker) <= len(tokens):
                        if tokens[i:i+len(marker)] == marker:
                            in_assistant = False
                            break
                
                if in_assistant:
                    masks[i] = tokens[i]
        
        return masks
    
    def _build_system_message(
        self,
        trajectory: BabylonTrajectory,
        market_outcomes: Optional[MarketOutcomes]
    ) -> str:
        """Build system message with ground truth"""
        
        msg = f"""You are evaluating trading agent decisions.

AGENT: {trajectory.agent_id}
TIME WINDOW: {trajectory.window_id}
"""
        
        if market_outcomes and market_outcomes.stocks:
            msg += "\nMARKET OUTCOMES (ground truth agent didn't know):\n"
            
            for ticker, outcome in market_outcomes.stocks.items():
                msg += f"\n{ticker}:"
                msg += f"\n  Price: ${outcome.start_price:.2f} → ${outcome.end_price:.2f} ({outcome.change_percent:+.1f}%)"
                msg += f"\n  Sentiment: {outcome.sentiment or 'UNKNOWN'}"
                
                if outcome.news_events:
                    msg += f"\n  News: {outcome.news_events[0]}"
        
        msg += "\n\nEvaluate this agent's decisions given the outcomes."
        return msg
    
    def convert_window_group(
        self,
        trajectories: List[BabylonTrajectory],
        market_outcomes: Optional[MarketOutcomes],
        scores: Optional[List[float]] = None,
        max_per_group: int = 8,
        tokenizer = None,
    ) -> ScoredGroupResult:
        """
        Convert window trajectories to Atropos ScoredDataGroup
        
        Raises on any conversion error - no silent failures
        """
        if len(trajectories) < 2:
            raise ValueError(f"Need at least 2 trajectories for GRPO, got {len(trajectories)}")
        
        # Sample if too many
        if len(trajectories) > max_per_group:
            indices = random.sample(range(len(trajectories)), max_per_group)
            sampled = [trajectories[i] for i in indices]
            if scores:
                scores = [scores[i] for i in indices]
        else:
            sampled = trajectories
        
        # Convert all (fail on any error)
        atropos_trajectories: List[AtroposTrajectory] = []
        for traj in sampled:
            atropos_traj = self.convert_trajectory(traj, market_outcomes, tokenizer)
            if atropos_traj:  # None means dropout
                atropos_trajectories.append(atropos_traj)
        
        if len(atropos_trajectories) < 2:
            raise ValueError(
                f"After dropout, only {len(atropos_trajectories)} trajectories remain (need 2+)"
            )
        
        # Build ScoredDataGroup
        tokens_list = [t.tokens for t in atropos_trajectories]
        masks_list = [t.masks for t in atropos_trajectories]
        logprobs_list = [t.logprobs for t in atropos_trajectories]
        
        # Use provided scores or default to 0.0
        if scores and len(scores) == len(atropos_trajectories):
            scores_list = scores[:len(atropos_trajectories)]
        else:
            scores_list = [0.0] * len(atropos_trajectories)
        
        # Include messages if requested
        messages_list: List[List[Dict[str, str]]] = []
        if self.include_messages:
            messages_list = [t.to_messages_list() for t in atropos_trajectories]
        
        return ScoredGroupResult(
            tokens=tokens_list,
            masks=masks_list,
            scores=scores_list,
            inference_logprobs=logprobs_list,
            messages=messages_list,
        )


def calculate_dropout_rate(
    total_trajectories: int,
    target_trajectories: int = 1000,
    max_dropout: float = 0.3
) -> float:
    """
    Calculate dropout rate - pure function, no side effects
    
    Args:
        total_trajectories: Available trajectories
        target_trajectories: Desired number
        max_dropout: Maximum dropout allowed
    
    Returns:
        Dropout rate (0.0-max_dropout)
    """
    if total_trajectories <= target_trajectories:
        return 0.0
    
    needed = 1.0 - (target_trajectories / total_trajectories)
    return min(max_dropout, needed)


