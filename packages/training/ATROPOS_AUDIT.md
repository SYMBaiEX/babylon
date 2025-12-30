# Babylon Training Pipeline Audit: Atropos Integration

> Comprehensive analysis of Babylon's training implementation vs Atropos best practices

**Audit Date:** December 30, 2025  
**Version:** 2.0  
**Scope:** `/packages/training/python/` and `/packages/training/src/`  
**Reference:** Atropos Framework (atroposlib), Nous Research

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What You're Doing Right](#-what-youre-doing-right)
3. [Critical Issues](#-critical-issues)
4. [Moderate Issues](#-moderate-issues)
5. [Minor Issues](#-minor-issues)
6. [Architecture Analysis](#-architecture-analysis)
7. [Code-Level Findings](#-code-level-findings)
8. [Comparison Matrix](#-comparison-matrix)
9. [Recommendations](#-recommendations)

---

## Executive Summary

Babylon has built a sophisticated RL training pipeline integrating Atropos for GRPO training. The implementation shows **strong architectural decisions** but has **one critical flaw** that prevents effective training: using historical trajectories instead of online rollouts.

### Overall Assessment

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | ⭐⭐⭐⭐ | Clean separation, good patterns |
| **Atropos Integration** | ⭐⭐⭐ | Correct structure, wrong data flow |
| **Reward Engineering** | ⭐⭐⭐⭐ | Archetype-aware, comprehensive |
| **Data Pipeline** | ⭐⭐ | Works but fundamentally off-policy |
| **Evaluation** | ⭐⭐ | Minimal implementation |
| **Scalability** | ⭐⭐⭐ | Good foundation |
| **Testing** | ⭐⭐⭐ | Reasonable coverage |

### The Core Problem

```
╔══════════════════════════════════════════════════════════════════════╗
║                    THE FUNDAMENTAL ISSUE                              ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  GRPO requires ON-POLICY data: completions from the CURRENT model   ║
║                                                                       ║
║  Babylon trains on OFF-POLICY data: trajectories from OLD models    ║
║                                                                       ║
║  This causes:                                                         ║
║  • Distribution mismatch between training and inference              ║
║  • Model cannot learn from its own mistakes                          ║
║  • Unstable training, poor convergence                               ║
║  • Wasted compute on non-representative data                         ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Audit Findings Summary

| Priority | Issue Count | Description |
|----------|-------------|-------------|
| P0 (Critical) | 3 | Blocks effective training |
| P1 (High) | 4 | Significantly impacts quality |
| P2 (Medium) | 5 | Should address |
| P3 (Low) | 3 | Nice to have |

---

## ✅ What You're Doing Right

### 1. Proper Environment/Trainer Architecture

You correctly separated the **environment** (`babylon_env.py`) from the **trainer** (`atropos_trainer.py`). This matches the Atropos pattern:

```
Environment (BabylonRLAIFEnv) → Atropos API ← Trainer (BabylonAtroposTrainer)
```

**Evidence from your code:**

```35:62:packages/training/python/src/training/babylon_env.py
class BabylonEnvConfig(BaseEnvConfig):
    """Configuration for Babylon RLAIF Environment"""
    
    # Inherits from BaseEnvConfig correctly
    group_size: int = 2
    max_token_length: int = 4096
    tokenizer_name: str = "Qwen/Qwen2.5-3B-Instruct"
    ...
```

**Why this is good:**
- Clean separation of concerns
- Environment handles data, trainer handles optimization
- Follows Atropos's proven pattern

### 2. Archetype-Aware Reward System

Your reward system in `rewards.py` is **excellent**:

```python
# 12 distinct archetypes with custom scoring weights
ARCHETYPE_REWARD_WEIGHTS = {
    "trader": {"pnl": 0.55, "format": 0.20, "reasoning": 0.15, "behavior": 0.10},
    "degen": {"pnl": 0.15, "format": 0.15, "reasoning": 0.10, "behavior": 0.60},
    "social-butterfly": {"pnl": 0.10, "format": 0.20, "reasoning": 0.15, "behavior": 0.55},
    "researcher": {"pnl": 0.25, "format": 0.20, "reasoning": 0.40, "behavior": 0.15},
    # ... 8 more archetypes
}
```

**Why this is good:**
- Different behaviors require different incentives
- Degens should be rewarded for action frequency, not just P&L
- Researchers should be rewarded for reasoning quality
- Prevents reward hacking towards single strategy

### 3. Single Source of Truth for Rubrics

Your `rubric_loader.py` loads from canonical JSON config shared between TypeScript and Python:

```python
# packages/training/python/src/training/rubric_loader.py
def load_rubric(archetype: str) -> Dict:
    """Load rubric from shared JSON config"""
    rubric_path = Path(__file__).parent.parent.parent.parent / "src" / "rubrics" / f"{archetype}.json"
    ...
```

**Why this is good:**
- Eliminates scoring drift between TS and Python
- Single place to update scoring criteria
- Easy to version control and audit

### 4. Comprehensive Behavioral Metrics

Your `BehaviorMetrics` dataclass captures 25+ metrics:

```python
@dataclass
class BehaviorMetrics:
    # Trading metrics
    trades_executed: int = 0
    trade_win_rate: float = 0.0
    pnl_variance: float = 0.0
    avg_position_size: float = 0.0
    max_drawdown: float = 0.0
    
    # Social metrics
    dms_sent: int = 0
    group_chats_joined: int = 0
    posts_created: int = 0
    comments_made: int = 0
    
    # Influence metrics
    followers_gained: int = 0
    reputation_delta: float = 0.0
    viral_posts: int = 0
    
    # Research metrics
    predictions_made: int = 0
    prediction_accuracy: float = 0.0
    research_depth: float = 0.0
```

**Why this is good:**
- Rich feature set for nuanced scoring
- Supports diverse archetype behaviors
- Enables ablation studies

### 5. FastSimulator Design

Your `fast_simulator.py` is well-designed for high-throughput:

```python
class FastSimulator:
    """
    Fast simulator for benchmarking and data generation.
    Optimized for throughput with minimal overhead.
    """
    
    async def run_tick(
        self,
        agent_runners: dict[str, AgentRunner],
    ) -> dict[str, AgentTickData]:
        # Uses asyncio.gather for true parallel execution
        tick_results = await asyncio.gather(*coros, return_exceptions=True)
```

**Why this is good:**
- Parallel agent execution
- Clean GameState structure
- Ready for online rollout integration

### 6. Service Management

Your `ServiceManager` handles vLLM lifecycle cleanly:

```python
class ServiceManager:
    """Manages background services for local training"""
    
    def __enter__(self) -> "ServiceManager":
        signal.signal(signal.SIGINT, self._signal_handler)
        self.start_all()
        return self
    
    def restart_vllm(self, model_path: Optional[str] = None) -> bool:
        """Restart vLLM with optionally updated model weights"""
        ...
```

**Why this is good:**
- Clean context manager pattern
- Proper signal handling
- Supports weight hot-reloading

### 7. Tinker Integration (Forward-Looking)

Your `tinker_trainer.py` shows good foresight:

```python
class BabylonTinkerTrainer:
    """
    GRPO Trainer using Tinker API.
    
    Benefits over local training:
    - No local GPU required
    - Access to larger models (Qwen3-235B)
    - Faster weight sync (no vLLM restarts)
    """
```

**Why this is good:**
- Reduces local infrastructure requirements
- Enables access to larger models
- Future-proof architecture

---

## ❌ Critical Issues

### Issue P0-1: No Online Rollout Collection

**Severity:** Critical  
**Impact:** Training is fundamentally ineffective  
**Location:** `babylon_env.py` lines 100-150

**Current behavior:**
```python
async def _load_trajectories(self):
    """Load trajectories from database"""
    rows = await conn.fetch("""
        SELECT ... FROM trajectories t
        WHERE t."createdAt" > NOW() - $1::interval
    """)
```

**Problem:**
- Trajectories in database were generated by **previous model versions**
- Could be days or weeks old
- Distribution mismatch with current policy
- GRPO requires on-policy data

**Correct pattern (from Atropos RLAIF env):**
```python
async def collect_trajectories(self, item) -> Tuple[ScoredDataGroup, List]:
    # Generate with CURRENT model
    async with self.server.managed_server(tokenizer=self.tokenizer) as managed:
        chat_completions = await managed.chat_completion(
            messages=chat,
            n=self.config.group_size,  # Generate N completions
            max_tokens=self.config.max_token_length // 3,
        )
        
        # Score and return
        scored_data = await self.score(to_score)
        return scored_data, []
```

**Fix:** Create `BabylonOnlineEnv` that generates rollouts in real-time.

---

### Issue P0-2: Incorrect Token Masking

**Severity:** Critical  
**Impact:** Training on wrong tokens, wastes compute  
**Location:** `babylon_env.py` line 200+

**Current behavior:**
```python
rollout_data.append({
    "masks": [1] * len(tokens),  # Trains on EVERYTHING
})
```

**Problem:**
- Trains on system prompts (can't be changed by model)
- Trains on user messages (model doesn't generate these)
- Only ~20-30% of tokens are actually model outputs
- Wastes 70-80% of compute

**Correct pattern (from Atropos):**
```python
from atroposlib.utils.tokenize_for_trainer import tokenize_for_trainer

result = tokenize_for_trainer(
    tokenizer=self.tokenizer,
    chat=messages,
    train_on_all_assistant_turns=True,
)

# result["masks"] has -100 for non-training tokens
```

**Fix:** Use `tokenize_for_trainer` utility from atroposlib.

---

### Issue P0-3: Training Signal Misalignment

**Severity:** Critical  
**Impact:** Model learns wrong objective  
**Location:** `babylon_env.py` `collect_trajectories` method

**Current behavior:**
```python
# You load a historical trajectory
trajectory = load_from_db()

# Generate a NEW response for comparison
response = await vllm.chat_completion(trajectory_as_prompt)

# Train on the new response
```

**Problem:**
- Historical trajectory had **action decisions** embedded in context
- New response is just a **summary/reaction** to that context
- Model learns to summarize, not to make decisions
- Training signal is for wrong task

**What you need:**
```python
# Start with scenario (market state, not trajectory)
scenario = load_scenario()

# Model makes DECISIONS
for step in range(max_steps):
    action = await model.generate(observation)  # MODEL DECIDES
    next_state, reward = simulate(action)       # ACTION HAS CONSEQUENCES
    
# Train model to make better decisions
```

**Fix:** Restructure to train on decision-making, not trajectory summarization.

---

## ⚠️ Moderate Issues

### Issue P1-1: Group Size Too Small

**Severity:** High  
**Impact:** Poor advantage estimation, noisy gradients  
**Location:** `babylon_env.py` config

**Current:**
```python
env_config = BabylonEnvConfig(
    group_size=2,  # Only 2 samples per group
)
```

**Problem:**
- With N=2, advantages are essentially +0.5 and -0.5
- High variance in gradient estimates
- Slower convergence

**Recommended:**
```python
env_config = BabylonEnvConfig(
    group_size=4,   # Minimum for stable training
    # group_size=8,  # Recommended for best results
)
```

**Atropos patterns:**
- RLAIF: `group_size=2` (but with LLM judge, different tradeoff)
- GSM8K: `group_size=4`
- IF-Eval: `group_size=8`

---

### Issue P1-2: Missing Think Tag Validation

**Severity:** High  
**Impact:** Format drift, inconsistent outputs  
**Location:** `quality_utils.py`, `rewards.py`

**Current:**
- No enforcement of `<think>` tag structure
- Model can drift to any output format

**Required:**
```python
def validate_think_tags(response: str) -> bool:
    """Validate exactly one <think></think> block"""
    think_opens = response.count('<think>')
    think_closes = response.count('</think>')
    
    if think_opens != 1 or think_closes != 1:
        return False
    
    # Check order
    open_idx = response.index('<think>')
    close_idx = response.index('</think>')
    
    return close_idx > open_idx
```

**Atropos pattern:**
```python
# From multiple Atropos environments
if response.count('<think>') != 1 or response.count('</think>') != 1:
    return 0.0  # Format error, zero score
```

---

### Issue P1-3: No Length Penalty

**Severity:** High  
**Impact:** Verbose, padding responses  
**Location:** Not implemented

**Problem:**
- Models can game rewards by being verbose
- Long responses waste tokens without adding value
- No incentive for conciseness

**Required:**
```python
def apply_length_penalty(score: float, tokens: int, max_tokens: int) -> float:
    """Penalize responses approaching max length"""
    ratio = tokens / max_tokens
    
    if ratio > 0.75:
        penalty = (ratio - 0.75) / 0.25  # 0 to 1
        return score * (1.0 - penalty * 0.5)  # Max 50% penalty
    
    return score
```

---

### Issue P1-4: Heuristic Quality Scoring

**Severity:** High  
**Impact:** Weak training signal  
**Location:** `rewards.py` quality scoring

**Current:**
```python
fmt_score = 0.5  # Default middle score
if generated_response:
    if len(generated_response) > 50:
        fmt_score += 0.2
    if any(kw in generated_response.lower() for kw in ['action', 'trade']):
        fmt_score += 0.2
```

**Problem:**
- Length-based scoring is gameable
- Keyword matching is too simple
- No structural validation

**Required:**
```python
def score_quality(response: str, action: Dict) -> float:
    """Structured quality scoring"""
    score = 0.0
    
    # 1. Format validation (0.3)
    if validate_think_tags(response):
        score += 0.3
    
    # 2. Action parsing success (0.3)
    try:
        parsed = parse_action(response)
        if parsed["action_type"] and parsed["parameters"]:
            score += 0.3
    except:
        pass
    
    # 3. Reasoning-action alignment (0.4)
    thinking = extract_thinking(response)
    alignment = check_alignment(thinking, action)
    score += alignment * 0.4
    
    return score
```

---

## 📋 Moderate Issues

### Issue P2-1: Weak Evaluation Infrastructure

**Location:** `babylon_env.py` `evaluate` method

**Current:**
```python
async def evaluate(self, *args, **kwargs):
    # Just calculates average P&L from cached trajectories
    for _ in range(min(10, len(self.trajectory_cache))):
        group = random.choice(self.trajectory_cache)
        avg_pnl = sum(t.get("final_pnl", 0) for t in trajs) / len(trajs)
```

**Missing:**
- No held-out test set
- No comparison to baseline
- No per-archetype breakdown
- No format compliance metrics
- No trend tracking

---

### Issue P2-2: No Data Dumping

**Problem:** Successful rollouts aren't saved for:
- Debugging
- SFT dataset generation
- DPO pair construction
- Offline analysis

---

### Issue P2-3: TypeScript/Python Scoring Inconsistency

**Location:** `ArchetypeScoringService.ts` vs `rewards.py`

**Risk:**
- TS scores trajectories for database
- Python scores during training
- If weights differ, training signal is inconsistent

---

### Issue P2-4: vLLM Management in Trainer

**Location:** `atropos_trainer.py`

**Current:** Trainer manages vLLM directly:
```python
def start_vllm(self, model_path: Optional[str] = None):
    cmd = ["python", "-m", "vllm.entrypoints.openai.api_server", ...]
```

**Better:** Use Atropos's `ServerManager` or keep in environment.

---

### Issue P2-5: No Curriculum Control

**Problem:** No adaptive difficulty selection:
- Easy scenarios waste compute
- Hard scenarios before model is ready cause frustration
- No tracking of solved vs unsolved

---

## 📊 Comparison Matrix

| Feature | Babylon | GSM8K (Atropos) | RLAIF (Atropos) | IF-Eval (Atropos) |
|---------|---------|-----------------|-----------------|-------------------|
| **Online rollouts** | ❌ | ✅ | ✅ | ✅ |
| **Curriculum control** | ❌ | ❌ | ❌ | ✅ |
| **Data dumping** | ❌ | ✅ | ❌ | ✅ |
| **Think tag validation** | ❌ | ✅ | ✅ | ✅ |
| **Length penalty** | ❌ | ✅ | ❌ | ✅ |
| **Proper masking** | ❌ | ✅ | ✅ | ✅ |
| **LLM judge scoring** | ⚠️ partial | ❌ | ✅ | ❌ |
| **Archetype-aware** | ✅ | ❌ | ✅ (personality) | ❌ |
| **Evaluation metrics** | ⚠️ weak | ✅ | ⚠️ | ✅ |
| **Group size** | 2 only | 4-8 | 2 | 4-8 |
| **Checkpoint resume** | ✅ | ✅ | ✅ | ✅ |
| **Multi-turn** | ⚠️ partial | ❌ | ✅ | ❌ |
| **Managed server** | ❌ | ✅ | ✅ | ✅ |

---

## 🔍 Code-Level Findings

### babylon_env.py Analysis

**Lines 1-50: Config**
```python
class BabylonEnvConfig(BaseEnvConfig):
    # ✅ Good: Inherits from BaseEnvConfig
    # ⚠️ Issue: group_size=2 is too small
    # ⚠️ Issue: No format validation config
```

**Lines 100-200: Data Loading**
```python
async def _load_trajectories(self):
    # ❌ Critical: Loads from DB instead of generating
    # ❌ Critical: Data is off-policy
```

**Lines 200-300: collect_trajectories**
```python
async def collect_trajectories(self, item):
    # ❌ Critical: Uses historical data
    # ❌ Critical: Wrong masking
    # ⚠️ Issue: Doesn't use managed_server
```

### atropos_trainer.py Analysis

**Lines 1-100: Config**
```python
class AtroposTrainingConfig(BaseModel):
    # ✅ Good: Comprehensive config
    # ✅ Good: LR scheduling options
```

**Lines 200-400: Training Loop**
```python
# ✅ Good: Proper GRPO loss implementation
# ✅ Good: Gradient accumulation
# ⚠️ Issue: No KL penalty
```

### rewards.py Analysis

**Lines 1-100: Weights**
```python
ARCHETYPE_REWARD_WEIGHTS = {...}
# ✅ Excellent: Comprehensive archetype coverage
# ✅ Good: Meaningful weight differences
```

**Lines 500-700: Scoring**
```python
def score_trajectory():
    # ⚠️ Issue: Heuristic format scoring
    # ⚠️ Issue: No length penalty
    # ✅ Good: Uses archetype weights
```

### fast_simulator.py Analysis

**Lines 1-200: Core**
```python
class FastSimulator:
    # ✅ Excellent: Well-designed for throughput
    # ✅ Good: Parallel execution
    # ✅ Good: Clean state management
```

**Lines 400-600: Execution**
```python
async def run_tick():
    # ✅ Good: Uses asyncio.gather
    # ✅ Good: Exception handling
```

---

## 🏗️ Architecture Diagrams

### Current Data Flow (Problematic)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CURRENT TRAINING DATA FLOW                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Week 1                      Week 2                      Week 3    │
│   ┌───────┐                  ┌───────┐                  ┌───────┐   │
│   │Model  │                  │Model  │                  │Model  │   │
│   │v1.0   │                  │v1.1   │                  │v1.2   │   │
│   └───┬───┘                  └───┬───┘                  └───┬───┘   │
│       │                          │                          │       │
│       ▼                          ▼                          ▼       │
│   ┌───────┐                  ┌───────┐                  ┌───────┐   │
│   │Traj   │                  │Traj   │                  │Traj   │   │
│   │from   │                  │from   │                  │from   │   │
│   │v1.0   │─────────────────▶│v1.1   │─────────────────▶│v1.2   │   │
│   └───────┘                  └───────┘                  └───────┘   │
│                                  │                                   │
│                                  │ ❌ Training v1.2 on              │
│                                  │    data from v1.0/v1.1           │
│                                  ▼                                   │
│                             ┌─────────┐                             │
│                             │ v1.2    │                             │
│                             │ trained │                             │
│                             │ on stale│                             │
│                             │ data    │                             │
│                             └─────────┘                             │
│                                                                      │
│   RESULT: Model learns from outdated distribution                   │
│           Distribution mismatch causes instability                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Required Data Flow (On-Policy)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     REQUIRED TRAINING DATA FLOW                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │                   TRAINING LOOP                            │     │
│   │                                                            │     │
│   │   Step 1              Step 2              Step 3          │     │
│   │   ┌─────┐            ┌─────┐            ┌─────┐          │     │
│   │   │Model│───────────▶│Model│───────────▶│Model│          │     │
│   │   │v1.0 │            │v1.1 │            │v1.2 │          │     │
│   │   └──┬──┘            └──┬──┘            └──┬──┘          │     │
│   │      │                  │                  │              │     │
│   │      │ Generate         │ Generate         │ Generate    │     │
│   │      │ with v1.0        │ with v1.1        │ with v1.2   │     │
│   │      ▼                  ▼                  ▼              │     │
│   │   ┌─────┐            ┌─────┐            ┌─────┐          │     │
│   │   │Traj │            │Traj │            │Traj │          │     │
│   │   │from │            │from │            │from │          │     │
│   │   │v1.0 │            │v1.1 │            │v1.2 │          │     │
│   │   └──┬──┘            └──┬──┘            └──┬──┘          │     │
│   │      │                  │                  │              │     │
│   │      │ Train v1.0       │ Train v1.1       │ Train v1.2  │     │
│   │      │ on v1.0 data     │ on v1.1 data     │ on v1.2 data│     │
│   │      ▼                  ▼                  ▼              │     │
│   │   ┌─────┐            ┌─────┐            ┌─────┐          │     │
│   │   │v1.1 │            │v1.2 │            │v1.3 │          │     │
│   │   └─────┘            └─────┘            └─────┘          │     │
│   │                                                            │     │
│   └───────────────────────────────────────────────────────────┘     │
│                                                                      │
│   RESULT: Model always learns from its own outputs                  │
│           Distribution aligned → stable training                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📝 Recommendations

### Immediate Actions (This Week)

1. **Create BabylonOnlineEnv** - New environment generating on-policy rollouts
2. **Fix token masking** - Use `tokenize_for_trainer` from atroposlib
3. **Increase group_size** - Change from 2 to 4+

### Short-Term (2 Weeks)

4. **Add think tag validation** - Zero score for format violations
5. **Implement length penalty** - Prevent verbose gaming
6. **Create evaluation suite** - Track training progress

### Medium-Term (1 Month)

7. **Curriculum learning** - Adaptive difficulty
8. **Data dumping** - Save for SFT/DPO
9. **Score consistency validation** - TS/Python alignment

### Long-Term (2+ Months)

10. **KL penalty** - Prevent reward hacking
11. **Multi-turn episodes** - Proper credit assignment
12. **Scenario generation** - Synthetic training data

---

## Files Changed Summary

| File | Status | Key Issues |
|------|--------|------------|
| `babylon_env.py` | ❌ Critical | Off-policy data, wrong masking |
| `atropos_trainer.py` | ⚠️ Minor | vLLM management, no KL |
| `rewards.py` | ⚠️ Minor | Heuristic scoring, no length penalty |
| `fast_simulator.py` | ✅ Good | Ready for integration |
| `rollout_generator.py` | ✅ Good | Well-designed, needs bridge |
| `quality_utils.py` | ⚠️ Minor | Missing think tag validation |
| `schemas.py` | ✅ Good | Comprehensive validation |
| `service_manager.py` | ✅ Good | Clean lifecycle management |

---

## Next Steps

See `ATROPOS_IMPROVEMENT_PLAN.md` for detailed implementation plan.

---

*End of Audit Document*
