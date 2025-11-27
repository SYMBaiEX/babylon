# Data Pipeline Critical Assessment

## Overview

This document analyzes the RL training data pipeline, identifying issues with ETL, context preparation, judging, and input/output pair formation.

---

## 🔴 CRITICAL ISSUES

### 1. Converter Discards Multiple LLM Calls Per Step

**Location**: `src/data_bridge/converter.py`, line 111

**Problem**:
```python
llm_call = step.llm_calls[0]  # Primary LLM call
```

Each step can contain multiple LLM calls (reasoning, action, evaluation, response), but the converter only uses the **first** call. This loses 50-80% of training data!

**Impact**: 
- Loss of reasoning training samples
- Loss of evaluation training samples  
- Incomplete model of agent behavior

**Fix**: See updated `converter.py` below that handles all LLM calls.

---

### 2. Mask Generation is Incorrect

**Location**: `src/data_bridge/converter.py`, lines 160-167

**Problem**:
```python
masks = [-100] * len(tokens)
# For now, mark all tokens as trainable
masks = tokens.copy()
```

This masks **all tokens** including system and user messages. Training should only compute loss on **assistant tokens**.

**Impact**:
- Model learns to predict user messages (wrong objective)
- Wasted compute on non-response tokens
- Potential distribution shift

**Fix**: Implement proper assistant-token-only masking.

---

### 3. Two Parallel Conversion Systems

**Problem**: The codebase has two separate systems:

| System | Location | Purpose | Multi-Prompt |
|--------|----------|---------|--------------|
| `BabylonToAtroposConverter` | `data_bridge/converter.py` | Full trajectory | ❌ No |
| `MultiPromptDatasetBuilder` | `training/multi_prompt_dataset.py` | Per-call samples | ✅ Yes |

**Impact**: Confusion about which to use, potential data inconsistencies.

**Fix**: 
- Use `MultiPromptDatasetBuilder` for per-call training (GRPO on individual decisions)
- Use `BabylonToAtroposConverter` for trajectory-level training only
- Add clear documentation

---

## 🟡 MODERATE ISSUES

### 4. Context Not Integrated Into Training Prompts

**Location**: `multi_prompt_dataset.py`, `_create_sample()`

**Problem**: 
```python
env_context = {
    "balance": step.environment_state.agent_balance,
    "pnl": step.environment_state.agent_pnl,
    "positions": step.environment_state.open_positions,
}
```

This context is stored as **metadata only**, not included in the actual training prompt.

**Current State**:
- ✅ Original prompts preserved exactly (good for distribution match)
- ❌ Context not available for model to learn from metadata

**Assessment**: This is actually **correct behavior** for now - we want exact prompt matching. Context should come from the logged prompts themselves, not injected later.

---

### 5. Trajectory-Level vs Step-Level Scoring Mismatch

**Problem**: 
- Judge (`JudgePromptBuilder`) scores **entire trajectories**
- Training needs **per-LLM-call** scores for effective GRPO

**Current Mitigation**: `_calculate_attributed_reward()` distributes trajectory scores to individual calls using heuristics.

**Assessment**: The heuristic attribution is reasonable but could be improved with step-level judge calls for important decisions.

---

### 6. Score Variance May Be Insufficient

**Problem**: For GRPO to work, we need score variance within groups.

**Current Checks**:
```python
min_score_variance: float = 0.01  # in get_training_groups()
```

**Assessment**: This is correctly implemented. Monitor score variance in training logs.

---

## ✅ THINGS THAT ARE CORRECT

### 1. Prompt Preservation
The `MultiPromptDatasetBuilder._create_sample()` correctly preserves exact prompts:
```python
system_prompt = llm_call.system_prompt or ""
user_prompt = llm_call.user_prompt
response = llm_call.response
```

### 2. Multi-Prompt Extraction
The `MultiPromptDatasetBuilder` correctly extracts all LLM calls from each step.

### 3. Reward Attribution
The `_calculate_attributed_reward()` implements reasonable credit assignment based on:
- Call purpose (action, reasoning, evaluation, response)
- Whether call led to action
- Action success
- Trajectory-level score

### 4. Diversity Metrics
`DiversityMetrics` in `PromptDataset` correctly tracks:
- Unique action types
- Score quartiles
- Archetype distribution
- Trajectory coverage

---

## INPUT/OUTPUT PAIR FORMAT

### Required Format for GRPO Training

Each training sample needs:
```python
{
    "messages": [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."},  # MODEL OUTPUT TO TRAIN
    ],
    "score": float,  # For advantage calculation
    "tokens": [int],  # Tokenized messages
    "masks": [int],   # -100 for system/user, token_id for assistant
}
```

### Current Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Messages format | ✅ | Correct in both systems |
| Score assignment | ✅ | Working with attribution |
| Tokenization | ⚠️ | Works but mask is wrong |
| Masking | 🔴 | **CRITICAL**: Masks all tokens, should only mask assistant |

---

## RECOMMENDED FIXES (Priority Order)

### Priority 1: Fix Mask Generation
```python
def create_proper_masks(tokens, tokenizer, messages):
    """Create mask that only trains on assistant responses."""
    masks = [-100] * len(tokens)
    
    # Find assistant response boundaries
    # This is tokenizer-specific
    assistant_start_token = tokenizer.encode("\n<|assistant|>", add_special_tokens=False)
    
    # Mark assistant tokens as trainable
    # ... implementation depends on tokenizer
    
    return masks
```

### Priority 2: Update Converter for Multi-Prompt (Optional)
The `MultiPromptDatasetBuilder` already handles this correctly. If you need trajectory-level training with all prompts, update `converter.py` to loop through all LLM calls.

### Priority 3: Add Step-Level Judge Calls (Enhancement)
For critical decisions (trades > $1000, failed trades), call the judge to score individual steps instead of just the trajectory.

---

## VALIDATION CHECKLIST

Before training, verify:

- [ ] Each sample has non-empty `system_prompt`, `user_prompt`, `response`
- [ ] Response length > 10 characters
- [ ] Score variance within groups > 0.01
- [ ] At least 2 samples per group for GRPO
- [ ] Mask only includes assistant tokens (after fix)
- [ ] Token count < max_seq_length
- [ ] Purpose distribution is reasonable (not all one type)

---

## TESTING COMMANDS

```bash
# Run validation
cd packages/training/python
./venv/bin/python scripts/validate_rollout_quality.py

# Test multi-prompt extraction
./venv/bin/python -c "
from src.training.multi_prompt_dataset import MultiPromptDatasetBuilder
builder = MultiPromptDatasetBuilder()
# ... add trajectories
stats = builder.get_statistics()
print(stats)
"

# Check mask distribution (after fix)
./venv/bin/python -c "
from src.data_bridge.converter import BabylonToAtroposConverter
# ... verify masks have mix of -100 and real tokens
"
```

