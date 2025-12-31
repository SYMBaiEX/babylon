"""
Tests for Tokenization Utilities

Tests cover:
- Proper prompt/completion masking
- Multi-turn conversation masking
- Mask validation
- Historical mask fixing
"""

import pytest
from unittest.mock import MagicMock, patch

from src.training.tokenization_utils import (
    TokenizationResult,
    tokenize_for_trainer,
    tokenize_conversation_for_trainer,
    validate_masks,
    create_masks_from_response_start,
    fix_historical_masks,
)


# =============================================================================
# Mock Tokenizer
# =============================================================================


class MockTokenizer:
    """Mock tokenizer for testing"""
    
    def __init__(self):
        self.vocab = {
            "<|system|>": 1,
            "<|user|>": 2,
            "<|assistant|>": 3,
            "<|end|>": 4,
            "hello": 10,
            "world": 11,
            "how": 12,
            "are": 13,
            "you": 14,
            "i": 15,
            "am": 16,
            "fine": 17,
            "thanks": 18,
            "for": 19,
            "asking": 20,
        }
        self.reverse_vocab = {v: k for k, v in self.vocab.items()}
    
    def encode(self, text: str, add_special_tokens: bool = True) -> list:
        """Simple word-level encoding"""
        words = text.lower().replace("<|", " <|").replace("|>", "|> ").split()
        tokens = []
        for word in words:
            word = word.strip()
            if word in self.vocab:
                tokens.append(self.vocab[word])
            else:
                tokens.append(100 + len(word))  # Unknown token
        return tokens
    
    def decode(self, tokens: list) -> str:
        """Simple decoding"""
        words = []
        for t in tokens:
            if t in self.reverse_vocab:
                words.append(self.reverse_vocab[t])
            else:
                words.append(f"[{t}]")
        return " ".join(words)
    
    def apply_chat_template(
        self,
        messages: list,
        return_tensors=None,
        add_generation_prompt: bool = False,
    ) -> list:
        """Mock chat template application"""
        tokens = []
        
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            # Add role token
            if role == "system":
                tokens.append(1)
            elif role == "user":
                tokens.append(2)
            elif role == "assistant":
                tokens.append(3)
            
            # Add content tokens
            tokens.extend(self.encode(content, add_special_tokens=False))
            
            # Add end token
            tokens.append(4)
        
        if add_generation_prompt:
            tokens.append(3)  # Assistant start token
        
        return tokens


# =============================================================================
# TokenizationResult Tests
# =============================================================================


class TestTokenizationResult:
    """Tests for TokenizationResult dataclass"""

    def test_creation(self):
        result = TokenizationResult(
            tokens=[1, 2, 3, 4, 5],
            masks=[0, 0, 1, 1, 1],
            prompt_length=2,
            completion_length=3,
            total_length=5,
        )
        
        assert len(result.tokens) == 5
        assert result.prompt_length == 2
        assert result.completion_length == 3


# =============================================================================
# tokenize_for_trainer Tests
# =============================================================================


class TestTokenizeForTrainer:
    """Tests for tokenize_for_trainer"""

    def test_empty_messages(self):
        tokenizer = MockTokenizer()
        
        result = tokenize_for_trainer(tokenizer, [])
        
        assert result.tokens == []
        assert result.masks == []
        assert result.total_length == 0

    def test_prompt_only(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "user", "content": "hello world"},
        ]
        
        result = tokenize_for_trainer(tokenizer, messages, add_generation_prompt=True)
        
        # All should be masked (no assistant response)
        assert all(m == 0 for m in result.masks)
        assert result.completion_length == 0

    def test_with_assistant_response(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "world"},
        ]
        
        result = tokenize_for_trainer(tokenizer, messages)
        
        # Should have both prompt and completion masks
        assert any(m == 0 for m in result.masks)  # Prompt masked
        assert any(m == 1 for m in result.masks)  # Completion unmasked
        assert len(result.masks) == len(result.tokens)

    def test_with_system_prompt(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "system", "content": "you are helpful"},
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        
        result = tokenize_for_trainer(tokenizer, messages)
        
        # System and user should be masked, assistant unmasked
        assert result.prompt_length > 0
        assert result.completion_length > 0
        assert result.prompt_length + result.completion_length == result.total_length

    def test_multiple_turns(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
            {"role": "user", "content": "how are you"},
            {"role": "assistant", "content": "fine thanks"},
        ]
        
        result = tokenize_for_trainer(tokenizer, messages)
        
        # Only last assistant should be unmasked
        assert result.completion_length > 0
        assert len(result.tokens) > 0


# =============================================================================
# tokenize_conversation_for_trainer Tests
# =============================================================================


class TestTokenizeConversationForTrainer:
    """Tests for tokenize_conversation_for_trainer"""

    def test_empty_messages(self):
        tokenizer = MockTokenizer()
        
        result = tokenize_conversation_for_trainer(tokenizer, [])
        
        assert result.tokens == []
        assert result.masks == []

    def test_single_turn(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        
        result = tokenize_conversation_for_trainer(tokenizer, messages)
        
        # User masked, assistant unmasked
        assert result.prompt_length > 0
        assert result.completion_length > 0

    def test_multi_turn_all_assistants_unmasked(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
            {"role": "user", "content": "how"},
            {"role": "assistant", "content": "fine"},
        ]
        
        result = tokenize_conversation_for_trainer(tokenizer, messages)
        
        # Should have unmasked tokens for both assistant turns
        assert result.completion_length > 0


# =============================================================================
# validate_masks Tests
# =============================================================================


class TestValidateMasks:
    """Tests for validate_masks"""

    def test_valid_masks(self):
        tokenizer = MockTokenizer()
        tokens = [1, 2, 3, 4, 5]
        masks = [0, 0, 0, 1, 1]  # Prompt then completion
        
        is_valid, issues = validate_masks(tokens, masks, tokenizer)
        
        assert is_valid is True
        assert issues == []

    def test_length_mismatch(self):
        tokenizer = MockTokenizer()
        tokens = [1, 2, 3, 4, 5]
        masks = [0, 0, 1]  # Too short
        
        is_valid, issues = validate_masks(tokens, masks, tokenizer)
        
        assert is_valid is False
        assert any("Length mismatch" in issue for issue in issues)

    def test_invalid_mask_values(self):
        tokenizer = MockTokenizer()
        tokens = [1, 2, 3, 4, 5]
        masks = [0, 0, 2, 1, 1]  # Invalid value 2
        
        is_valid, issues = validate_masks(tokens, masks, tokenizer)
        
        assert is_valid is False
        assert any("Invalid mask values" in issue for issue in issues)

    def test_all_masked(self):
        tokenizer = MockTokenizer()
        tokens = [1, 2, 3, 4, 5]
        masks = [0, 0, 0, 0, 0]  # All masked (no completion)
        
        is_valid, issues = validate_masks(tokens, masks, tokenizer)
        
        assert is_valid is False
        assert any("No unmasked tokens" in issue for issue in issues)

    def test_all_unmasked(self):
        tokenizer = MockTokenizer()
        tokens = [1, 2, 3, 4, 5]
        masks = [1, 1, 1, 1, 1]  # All unmasked (no prompt)
        
        is_valid, issues = validate_masks(tokens, masks, tokenizer)
        
        assert is_valid is False
        assert any("No masked tokens" in issue for issue in issues)


# =============================================================================
# create_masks_from_response_start Tests
# =============================================================================


class TestCreateMasksFromResponseStart:
    """Tests for create_masks_from_response_start"""

    def test_normal_case(self):
        tokens = [1, 2, 3, 4, 5]
        response_start = 3
        
        masks = create_masks_from_response_start(tokens, response_start)
        
        assert masks == [0, 0, 0, 1, 1]

    def test_start_at_beginning(self):
        tokens = [1, 2, 3, 4, 5]
        response_start = 0
        
        masks = create_masks_from_response_start(tokens, response_start)
        
        assert masks == [1, 1, 1, 1, 1]

    def test_start_at_end(self):
        tokens = [1, 2, 3, 4, 5]
        response_start = 5
        
        masks = create_masks_from_response_start(tokens, response_start)
        
        assert masks == [0, 0, 0, 0, 0]

    def test_negative_start_clamps(self):
        tokens = [1, 2, 3, 4, 5]
        response_start = -10
        
        masks = create_masks_from_response_start(tokens, response_start)
        
        assert masks == [1, 1, 1, 1, 1]

    def test_beyond_end_clamps(self):
        tokens = [1, 2, 3, 4, 5]
        response_start = 100
        
        masks = create_masks_from_response_start(tokens, response_start)
        
        assert masks == [0, 0, 0, 0, 0]


# =============================================================================
# fix_historical_masks Tests
# =============================================================================


class TestFixHistoricalMasks:
    """Tests for fix_historical_masks"""

    def test_all_ones_detected_and_fixed(self):
        tokenizer = MockTokenizer()
        tokens = [1, 10, 4, 2, 11, 4, 3, 12, 4]  # system hello, user world, assistant how
        masks = [1, 1, 1, 1, 1, 1, 1, 1, 1]  # All 1s (incorrect)
        messages = [
            {"role": "system", "content": "hello"},
            {"role": "user", "content": "world"},
            {"role": "assistant", "content": "how"},
        ]
        
        fixed = fix_historical_masks(tokens, masks, tokenizer, messages)
        
        # Should have some 0s now
        assert any(m == 0 for m in fixed)

    def test_already_valid_unchanged(self):
        tokenizer = MockTokenizer()
        tokens = [1, 2, 3, 4, 5]
        masks = [0, 0, 0, 1, 1]  # Already valid
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        
        fixed = fix_historical_masks(tokens, masks, tokenizer, messages)
        
        assert fixed == masks


# =============================================================================
# Integration Tests
# =============================================================================


class TestIntegration:
    """Integration tests combining multiple utilities"""

    def test_tokenize_validate_flow(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "system", "content": "you are helpful"},
            {"role": "user", "content": "hello world"},
            {"role": "assistant", "content": "hi there"},
        ]
        
        # Tokenize
        result = tokenize_for_trainer(tokenizer, messages)
        
        # Validate
        is_valid, issues = validate_masks(result.tokens, result.masks, tokenizer)
        
        # Should be valid
        assert len(result.tokens) > 0
        assert len(result.masks) == len(result.tokens)

    def test_fix_and_validate_flow(self):
        tokenizer = MockTokenizer()
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "world"},
        ]
        
        # Simulate broken historical masks
        tokens = tokenizer.apply_chat_template(messages)
        broken_masks = [1] * len(tokens)
        
        # Fix
        fixed_masks = fix_historical_masks(tokens, broken_masks, tokenizer, messages)
        
        # Should have some masked tokens now
        assert any(m == 0 for m in fixed_masks)


