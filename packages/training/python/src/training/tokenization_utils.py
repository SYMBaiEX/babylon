"""
Token Masking Utilities for GRPO Training

Provides proper token masking for training data. The key requirement is:
- Prompt tokens should be MASKED (mask=0) so the model doesn't learn from them
- Completion tokens should be UNMASKED (mask=1) so the model learns from them

This is critical for GRPO because we only want to update policy on the
model's own completions, not on the prompts.

The online environment (BabylonOnlineEnv) uses Atropos managed_server which
handles this automatically. This module provides utilities for:
1. Offline/historical data where masking wasn't applied correctly
2. Testing and validation of masking logic
3. Custom tokenization scenarios
"""

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from transformers import PreTrainedTokenizer

logger = logging.getLogger(__name__)


@dataclass
class TokenizationResult:
    """Result of tokenization with masks"""
    tokens: List[int]
    masks: List[int]
    prompt_length: int
    completion_length: int
    total_length: int


def tokenize_for_trainer(
    tokenizer: PreTrainedTokenizer,
    messages: List[Dict[str, str]],
    add_generation_prompt: bool = False,
) -> TokenizationResult:
    """
    Tokenize chat messages with proper masking for training.
    
    Creates masks where:
    - mask=0 for prompt tokens (not trained on)
    - mask=1 for completion tokens (trained on)
    
    The last assistant message is treated as the completion.
    All prior messages are treated as prompt.
    
    Args:
        tokenizer: HuggingFace tokenizer with chat template support
        messages: List of chat messages [{"role": "...", "content": "..."}]
        add_generation_prompt: Whether to add generation prompt for prompt-only tokenization
    
    Returns:
        TokenizationResult with tokens, masks, and length info
    """
    if not messages:
        return TokenizationResult(
            tokens=[],
            masks=[],
            prompt_length=0,
            completion_length=0,
            total_length=0,
        )
    
    # Find the last assistant message
    last_assistant_idx = None
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "assistant":
            last_assistant_idx = i
            break
    
    if last_assistant_idx is None:
        # No assistant message - treat all as prompt
        full_tokens = tokenizer.apply_chat_template(
            messages,
            return_tensors=None,
            add_generation_prompt=add_generation_prompt,
        )
        
        return TokenizationResult(
            tokens=full_tokens,
            masks=[0] * len(full_tokens),  # All masked (prompt only)
            prompt_length=len(full_tokens),
            completion_length=0,
            total_length=len(full_tokens),
        )
    
    # Split into prompt (before last assistant) and completion (last assistant)
    prompt_messages = messages[:last_assistant_idx]
    completion_message = messages[last_assistant_idx]
    
    # Tokenize prompt with generation prompt to get exact split point
    prompt_tokens = tokenizer.apply_chat_template(
        prompt_messages,
        return_tensors=None,
        add_generation_prompt=True,
    )
    
    # Tokenize full conversation
    full_tokens = tokenizer.apply_chat_template(
        messages,
        return_tensors=None,
        add_generation_prompt=False,
    )
    
    # Calculate completion length
    prompt_length = len(prompt_tokens)
    completion_length = len(full_tokens) - prompt_length
    
    # Handle edge case where tokenization differs
    if completion_length < 0:
        # Tokenizer may add different special tokens
        # Fall back to tokenizing completion separately
        completion_content = completion_message.get("content", "")
        completion_tokens_only = tokenizer.encode(completion_content, add_special_tokens=False)
        completion_length = len(completion_tokens_only)
        prompt_length = len(full_tokens) - completion_length
    
    # Create masks: 0 for prompt, 1 for completion
    masks = [0] * prompt_length + [1] * completion_length
    
    # Ensure masks match tokens length
    if len(masks) != len(full_tokens):
        logger.warning(
            f"Mask length mismatch: {len(masks)} vs {len(full_tokens)} tokens. "
            "Adjusting masks."
        )
        if len(masks) < len(full_tokens):
            # Pad with 1s (assume extra tokens are completion)
            masks.extend([1] * (len(full_tokens) - len(masks)))
        else:
            # Truncate
            masks = masks[:len(full_tokens)]
    
    return TokenizationResult(
        tokens=full_tokens,
        masks=masks,
        prompt_length=prompt_length,
        completion_length=completion_length,
        total_length=len(full_tokens),
    )


def tokenize_conversation_for_trainer(
    tokenizer: PreTrainedTokenizer,
    messages: List[Dict[str, str]],
) -> TokenizationResult:
    """
    Tokenize a multi-turn conversation for training.
    
    Masks all user/system messages and unmasks all assistant messages.
    This is useful for training on conversations where we want to
    learn from all assistant responses.
    
    Args:
        tokenizer: HuggingFace tokenizer with chat template support
        messages: List of chat messages
    
    Returns:
        TokenizationResult with tokens and masks
    """
    if not messages:
        return TokenizationResult(
            tokens=[],
            masks=[],
            prompt_length=0,
            completion_length=0,
            total_length=0,
        )
    
    full_tokens = tokenizer.apply_chat_template(
        messages,
        return_tensors=None,
        add_generation_prompt=False,
    )
    
    # Build masks by tracking message boundaries
    masks = []
    current_position = 0
    
    for i, message in enumerate(messages):
        # Tokenize up to and including this message
        partial_messages = messages[:i + 1]
        
        partial_tokens = tokenizer.apply_chat_template(
            partial_messages,
            return_tensors=None,
            add_generation_prompt=False,
        )
        
        # Calculate tokens for this message
        message_end = len(partial_tokens)
        message_length = message_end - current_position
        
        # Mask based on role
        if message["role"] == "assistant":
            masks.extend([1] * message_length)  # Train on assistant
        else:
            masks.extend([0] * message_length)  # Don't train on user/system
        
        current_position = message_end
    
    # Ensure masks match tokens length
    if len(masks) != len(full_tokens):
        logger.warning(
            f"Conversation mask length mismatch: {len(masks)} vs {len(full_tokens)}. "
            "Falling back to simple masking."
        )
        # Fall back to simpler approach
        return tokenize_for_trainer(tokenizer, messages)
    
    # Calculate prompt/completion lengths
    prompt_length = sum(1 for m in masks if m == 0)
    completion_length = sum(1 for m in masks if m == 1)
    
    return TokenizationResult(
        tokens=full_tokens,
        masks=masks,
        prompt_length=prompt_length,
        completion_length=completion_length,
        total_length=len(full_tokens),
    )


def validate_masks(
    tokens: List[int],
    masks: List[int],
    tokenizer: PreTrainedTokenizer,
) -> Tuple[bool, List[str]]:
    """
    Validate that masks are correctly applied.
    
    Checks:
    1. Masks and tokens have same length
    2. Masks contain only 0s and 1s
    3. There are some masked (prompt) tokens
    4. There are some unmasked (completion) tokens
    5. Transition from masked to unmasked makes sense
    
    Returns:
        (is_valid, list_of_issues)
    """
    issues = []
    
    if len(tokens) != len(masks):
        issues.append(f"Length mismatch: {len(tokens)} tokens vs {len(masks)} masks")
    
    invalid_masks = [m for m in masks if m not in (0, 1)]
    if invalid_masks:
        issues.append(f"Invalid mask values: {set(invalid_masks)}")
    
    if not any(m == 0 for m in masks):
        issues.append("No masked tokens (no prompt)")
    
    if not any(m == 1 for m in masks):
        issues.append("No unmasked tokens (no completion)")
    
    # Check for sensible transition
    if masks:
        # Find first unmasked token
        first_unmasked = None
        for i, m in enumerate(masks):
            if m == 1:
                first_unmasked = i
                break
        
        if first_unmasked is not None:
            # Check if there are masked tokens after first unmasked
            # (This might be valid for multi-turn, but warn anyway)
            for i in range(first_unmasked + 1, len(masks)):
                if masks[i] == 0:
                    # Decode context for debugging
                    context_start = max(0, i - 5)
                    context_end = min(len(tokens), i + 5)
                    context_tokens = tokens[context_start:context_end]
                    context = tokenizer.decode(context_tokens)
                    issues.append(
                        f"Masked token at position {i} after unmasked tokens. "
                        f"Context: {context[:100]}"
                    )
                    break  # Only report first occurrence
    
    is_valid = len(issues) == 0
    return is_valid, issues


def create_masks_from_response_start(
    tokens: List[int],
    response_start_position: int,
) -> List[int]:
    """
    Create masks given the starting position of the response.
    
    Simple utility when you already know where the response starts.
    
    Args:
        tokens: Full token sequence
        response_start_position: Index where response (completion) starts
    
    Returns:
        List of masks (0 before response, 1 from response onwards)
    """
    if response_start_position < 0:
        response_start_position = 0
    if response_start_position > len(tokens):
        response_start_position = len(tokens)
    
    return [0] * response_start_position + [1] * (len(tokens) - response_start_position)


def fix_historical_masks(
    tokens: List[int],
    masks: List[int],
    tokenizer: PreTrainedTokenizer,
    messages: List[Dict[str, str]],
) -> List[int]:
    """
    Fix incorrectly applied masks from historical data.
    
    Historical data from BabylonRLAIFEnv used [1]*len(tokens) which
    incorrectly trains on prompt tokens. This function recalculates
    proper masks.
    
    Args:
        tokens: Token sequence
        masks: Original (possibly incorrect) masks
        tokenizer: Tokenizer for re-tokenization
        messages: Original messages to determine prompt boundary
    
    Returns:
        Corrected mask sequence
    """
    # Check if masks look incorrect (all 1s is a red flag)
    if all(m == 1 for m in masks):
        logger.info("Detected all-1s masks, recalculating from messages")
        result = tokenize_for_trainer(tokenizer, messages)
        return result.masks
    
    # Validate current masks
    is_valid, issues = validate_masks(tokens, masks, tokenizer)
    if is_valid:
        return masks
    
    logger.warning(f"Invalid masks detected: {issues[:3]}. Recalculating.")
    result = tokenize_for_trainer(tokenizer, messages)
    
    # Ensure length matches
    if len(result.masks) == len(tokens):
        return result.masks
    
    # Last resort: find assistant turn manually
    # Look for common assistant turn markers in token sequence
    assistant_markers = [
        tokenizer.encode("assistant", add_special_tokens=False),
        tokenizer.encode("<|assistant|>", add_special_tokens=False),
        tokenizer.encode("<|im_start|>assistant", add_special_tokens=False),
    ]
    
    for marker_tokens in assistant_markers:
        if not marker_tokens:
            continue
        
        # Find last occurrence of marker
        for i in range(len(tokens) - len(marker_tokens), -1, -1):
            if tokens[i:i + len(marker_tokens)] == marker_tokens:
                # Start masking from after this marker
                response_start = i + len(marker_tokens)
                return create_masks_from_response_start(tokens, response_start)
    
    # If all else fails, return original masks with warning
    logger.error("Could not fix masks, returning original")
    return masks

