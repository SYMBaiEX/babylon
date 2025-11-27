"""
Shared Type Definitions for Babylon RL Training
Strong, validated types - no Any, no unknown casts
"""

from typing import Dict, List, Literal
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime

# Type alias for JSON-serializable values
# Using object as value type is safer than Any - it requires explicit casting
JsonDict = Dict[str, object]

# Type alias for chat messages with known structure
ChatMessage = Dict[str, str]  # {"role": str, "content": str}


class EnvironmentState(BaseModel):
    """Environment state at a given point"""
    agent_balance: float
    agent_pnl: float
    open_positions: int
    active_markets: int = 0


class ProviderAccess(BaseModel):
    """Data accessed from a provider"""
    model_config = ConfigDict(extra="allow")
    
    provider_name: str
    data: JsonDict
    purpose: str


class LLMCall(BaseModel):
    """
    Single LLM call record.
    
    Matches the TypeScript LLMCall interface in plugin-trajectory-logger/types.ts
    """
    model: str
    model_version: str | None = None  # RL model version if using trained model
    system_prompt: str
    user_prompt: str
    response: str
    reasoning: str | None = None  # Chain-of-thought if applicable
    temperature: float
    max_tokens: int
    latency_ms: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    purpose: Literal['action', 'reasoning', 'evaluation', 'response', 'other']
    action_type: str | None = None  # e.g., 'post', 'trade', 'comment'


class Action(BaseModel):
    """Action taken by agent"""
    model_config = ConfigDict(extra="allow")
    
    action_type: str
    parameters: JsonDict
    success: bool
    result: JsonDict | None = None
    error: str | None = None
    reasoning: str | None = None


class TrajectoryStep(BaseModel):
    """Single step in a trajectory"""
    step_number: int
    timestamp: int
    environment_state: EnvironmentState
    provider_accesses: List[ProviderAccess]
    llm_calls: List[LLMCall]
    action: Action
    reward: float


class BabylonTrajectory(BaseModel):
    """Complete trajectory from database"""
    model_config = ConfigDict(frozen=False)  # Allow modifications
    
    id: str
    trajectory_id: str
    agent_id: str
    window_id: str
    start_time: datetime
    end_time: datetime
    duration_ms: int
    scenario_id: str | None = None
    episode_id: str | None = None
    steps: List[TrajectoryStep]
    total_reward: float
    final_pnl: float
    final_balance: float | None = None
    trades_executed: int | None = None
    posts_created: int | None = None
    episode_length: int
    final_status: str


class StockOutcome(BaseModel):
    """Market outcome for a stock"""
    ticker: str
    start_price: float
    end_price: float
    change_percent: float
    sentiment: Literal['BULLISH', 'BEARISH', 'NEUTRAL'] | None = None
    news_events: List[str] = Field(default_factory=list)


class PredictionOutcome(BaseModel):
    """Outcome for a prediction market"""
    market_id: str
    question: str
    outcome: Literal['YES', 'NO', 'UNRESOLVED']
    final_probability: float


class MarketOutcomes(BaseModel):
    """All market outcomes for a window"""
    window_id: str
    window_start: datetime
    window_end: datetime
    stocks: dict[str, StockOutcome] = Field(default_factory=dict)
    predictions: dict[str, PredictionOutcome] = Field(default_factory=dict)
    overall_trend: Literal['BULLISH', 'BEARISH', 'NEUTRAL'] | None = None
    volatility: Literal['HIGH', 'MEDIUM', 'LOW'] | None = None


class WindowStatistics(BaseModel):
    """Statistics for a training window"""
    window_id: str
    agent_count: int
    trajectory_count: int
    total_actions: int
    avg_pnl: float
    min_pnl: float
    max_pnl: float
    start_time: datetime
    end_time: datetime


class TrainingBatchSummary(BaseModel):
    """Summary of a training batch"""
    windows: int
    total_trajectories: int
    avg_trajectories_per_window: float
    score_min: float
    score_max: float
    score_avg: float
    pnl_min: float
    pnl_max: float
    pnl_avg: float


# =============================================================================
# Atropos-compatible types
# =============================================================================


class AtroposScoredItem(BaseModel):
    """Single scored item for Atropos training"""
    tokens: List[int]
    masks: List[int]
    score: float
    logprobs: List[float] = Field(default_factory=list)
    messages: List[ChatMessage] = Field(default_factory=list)


class AtroposScoredGroup(BaseModel):
    """Group of scored items for Atropos GRPO training"""
    tokens: List[List[int]]
    masks: List[List[int]]
    scores: List[float]
    inference_logprobs: List[List[float]] = Field(default_factory=list)
    messages: List[List[ChatMessage]] = Field(default_factory=list)
    env_id: int | None = None
    
    @property
    def group_size(self) -> int:
        return len(self.tokens)


class TrajectoryGroup(BaseModel):
    """Group of trajectories for relative comparison"""
    group_key: str
    window_id: str
    scenario_id: str | None = None
    trajectories: List[BabylonTrajectory]
    
    @property
    def size(self) -> int:
        return len(self.trajectories)
    
    def get_pnl_stats(self) -> dict:
        """Get P&L statistics for the group"""
        pnls = [t.final_pnl for t in self.trajectories]
        return {
            "min": min(pnls) if pnls else 0,
            "max": max(pnls) if pnls else 0,
            "mean": sum(pnls) / len(pnls) if pnls else 0,
        }


class JudgeScore(BaseModel):
    """Score from LLM judge for a trajectory"""
    trajectory_id: str
    score: float = Field(ge=0.0, le=1.0)
    explanation: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class JudgeResponse(BaseModel):
    """Response from LLM judge for a group of trajectories"""
    reasoning: str
    scores: List[JudgeScore]
    
    def get_score_for(self, trajectory_id: str) -> float | None:
        """Get score for a specific trajectory"""
        for score in self.scores:
            if score.trajectory_id == trajectory_id:
                return score.score
        return None


class TrainingMetrics(BaseModel):
    """Metrics from a training step"""
    step: int
    loss: float
    grad_norm: float
    learning_rate: float
    pos_logp: float = 0.0
    neg_logp: float = 0.0
    num_samples: int = 0
    timestamp: datetime = Field(default_factory=datetime.now)



