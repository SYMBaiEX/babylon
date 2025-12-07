"""
Babylon Trajectory Reader

Reads trajectories from PostgreSQL database for training.
Validates LLM call quality to ensure training data authenticity.
"""

import json
import os
from dataclasses import dataclass
from typing import Optional

import psycopg2


@dataclass
class TrajectoryRow:
    """Raw trajectory data from database."""

    trajectory_id: str
    agent_id: str
    window_id: str
    steps_json: str
    metrics_json: str
    metadata_json: str
    total_reward: float
    episode_length: int
    final_status: str
    final_pnl: Optional[float]
    trades_executed: Optional[int]
    ai_judge_reward: Optional[float]
    archetype: Optional[str]


def get_connection():
    """
    Get PostgreSQL connection from environment.

    Returns:
        psycopg2 connection

    Raises:
        ValueError: If DATABASE_URL not set
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable required")
    return psycopg2.connect(database_url)


def validate_llm_calls(steps: list, min_steps_with_llm: int = 3) -> tuple[bool, list[str]]:
    """
    Validate trajectory steps contain real LLM calls.

    Training data MUST have actual LLM calls with real prompts and responses.
    Synthetic or placeholder data will cause training failures.

    Args:
        steps: List of trajectory steps
        min_steps_with_llm: Minimum steps with valid LLM calls

    Returns:
        Tuple of (is_valid, list of issue descriptions)
    """
    issues: list[str] = []
    steps_with_llm = 0

    for i, step in enumerate(steps):
        llm_calls = step.get("llmCalls") or step.get("llm_calls") or []

        for call in llm_calls:
            system_prompt = call.get("systemPrompt") or call.get("system_prompt") or ""
            user_prompt = call.get("userPrompt") or call.get("user_prompt") or ""
            response = call.get("response") or ""

            # Validate content length
            if len(system_prompt) < 20:
                issues.append(f"Step {i}: system_prompt too short ({len(system_prompt)} chars)")
                continue

            if len(user_prompt) < 20:
                issues.append(f"Step {i}: user_prompt too short ({len(user_prompt)} chars)")
                continue

            if len(response) < 30:
                issues.append(f"Step {i}: response too short ({len(response)} chars)")
                continue

            steps_with_llm += 1

    if steps_with_llm < min_steps_with_llm:
        issues.append(f"Only {steps_with_llm}/{len(steps)} steps have valid LLM calls (need {min_steps_with_llm})")

    return len(issues) == 0, issues


def get_window_ids(limit: int = 100, only_scored: bool = True) -> list[str]:
    """
    Get distinct window IDs with training data.

    Args:
        limit: Maximum windows to return
        only_scored: Only return windows with scored trajectories

    Returns:
        List of window IDs
    """
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT DISTINCT "windowId"
        FROM trajectories
        WHERE "isTrainingData" = true
    """

    if only_scored:
        query += ' AND "aiJudgeReward" IS NOT NULL'

    query += ' ORDER BY "windowId" DESC LIMIT %s'

    cur.execute(query, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [row[0] for row in rows if row[0]]


def get_trajectories_by_window(
    window_id: str,
    min_score: Optional[float] = None,
    validate: bool = True,
) -> list[TrajectoryRow]:
    """
    Get trajectories for a specific window.

    Args:
        window_id: Window ID to query
        min_score: Optional minimum AI judge score
        validate: Whether to validate LLM calls

    Returns:
        List of trajectory rows
    """
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT "trajectoryId", "agentId", "windowId",
               "stepsJson", "metricsJson", "metadataJson",
               "totalReward", "episodeLength", "finalStatus",
               "finalPnL", "tradesExecuted", "aiJudgeReward",
               "archetype"
        FROM trajectories
        WHERE "windowId" = %s AND "isTrainingData" = true
    """

    params: list = [window_id]

    if min_score is not None:
        query += ' AND "aiJudgeReward" >= %s'
        params.append(min_score)

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    results: list[TrajectoryRow] = []

    for row in rows:
        trajectory = TrajectoryRow(
            trajectory_id=row[0],
            agent_id=row[1],
            window_id=row[2],
            steps_json=row[3],
            metrics_json=row[4],
            metadata_json=row[5],
            total_reward=float(row[6]) if row[6] else 0.0,
            episode_length=int(row[7]) if row[7] else 0,
            final_status=row[8] or "unknown",
            final_pnl=float(row[9]) if row[9] else None,
            trades_executed=int(row[10]) if row[10] else None,
            ai_judge_reward=float(row[11]) if row[11] else None,
            archetype=row[12],
        )

        if validate:
            steps = json.loads(trajectory.steps_json)
            is_valid, issues = validate_llm_calls(steps)
            if not is_valid:
                continue

        results.append(trajectory)

    return results


def get_all_training_trajectories(
    limit: int = 1000,
    min_score: Optional[float] = None,
    archetype: Optional[str] = None,
) -> list[TrajectoryRow]:
    """
    Get all training trajectories.

    Args:
        limit: Maximum trajectories to return
        min_score: Optional minimum AI judge score
        archetype: Optional filter by archetype

    Returns:
        List of trajectory rows
    """
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT "trajectoryId", "agentId", "windowId",
               "stepsJson", "metricsJson", "metadataJson",
               "totalReward", "episodeLength", "finalStatus",
               "finalPnL", "tradesExecuted", "aiJudgeReward",
               "archetype"
        FROM trajectories
        WHERE "isTrainingData" = true
    """

    params: list = []

    if min_score is not None:
        query += ' AND "aiJudgeReward" >= %s'
        params.append(min_score)

    if archetype is not None:
        query += ' AND "archetype" = %s'
        params.append(archetype)

    query += ' ORDER BY "createdAt" DESC LIMIT %s'
    params.append(limit)

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    results: list[TrajectoryRow] = []

    for row in rows:
        results.append(
            TrajectoryRow(
                trajectory_id=row[0],
                agent_id=row[1],
                window_id=row[2],
                steps_json=row[3],
                metrics_json=row[4],
                metadata_json=row[5],
                total_reward=float(row[6]) if row[6] else 0.0,
                episode_length=int(row[7]) if row[7] else 0,
                final_status=row[8] or "unknown",
                final_pnl=float(row[9]) if row[9] else None,
                trades_executed=int(row[10]) if row[10] else None,
                ai_judge_reward=float(row[11]) if row[11] else None,
                archetype=row[12],
            )
        )

    return results


def get_trajectory_stats() -> dict:
    """
    Get summary statistics for training data.

    Returns:
        Dictionary with counts, score distribution, etc.
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT 
            COUNT(*) as total,
            COUNT("aiJudgeReward") as scored,
            AVG("aiJudgeReward") as avg_score,
            MIN("aiJudgeReward") as min_score,
            MAX("aiJudgeReward") as max_score,
            COUNT(DISTINCT "archetype") as archetypes
        FROM trajectories
        WHERE "isTrainingData" = true
    """)

    row = cur.fetchone()
    cur.close()
    conn.close()

    return {
        "total": row[0] or 0,
        "scored": row[1] or 0,
        "avg_score": float(row[2]) if row[2] else 0.0,
        "min_score": float(row[3]) if row[3] else 0.0,
        "max_score": float(row[4]) if row[4] else 0.0,
        "archetypes": row[5] or 0,
    }
