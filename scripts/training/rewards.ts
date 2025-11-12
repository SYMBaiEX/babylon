import type { EpisodeRecord, RewardComponent, TrajectoryEvent } from "../../plugin-babylon/src/training/trajectory-types";
import { BabylonLLMClient } from "../../src/generator/llm/openai-client";

export interface EpisodeSummary {
  episodeId: string;
  agentId: string;
  characterName: string;
  totalReward: number;
  durationSeconds: number;
  pnlDelta: number;
  totalTrades: number;
  socialInteractions: number;
  actionErrors: number;
  observations: number;
  outcomes: number;
  rewardComponents: RewardComponent[];
}

export interface RulerScore {
  episodeId: string;
  score: number;
  reasoning: string;
}

export interface RewardComputationResult {
  summary: EpisodeSummary;
  components: RewardComponent[];
  rulerScore?: RulerScore;
}

function isActionEvent(event: TrajectoryEvent): event is Extract<TrajectoryEvent, { type: "action" }> {
  return event.type === "action";
}

function isOutcomeEvent(event: TrajectoryEvent): event is Extract<TrajectoryEvent, { type: "outcome" }> {
  return event.type === "outcome";
}

function isObservationEvent(event: TrajectoryEvent): event is Extract<TrajectoryEvent, { type: "observation" }> {
  return event.type === "observation";
}

export function summarizeEpisode(episode: EpisodeRecord): EpisodeSummary {
  const durationSeconds = episode.durationMs ? episode.durationMs / 1000 : 0;
  const totalTrades = episode.events.filter(
    (event) =>
      isActionEvent(event) &&
      (event.actionName === "BUY_SHARES" || event.actionName === "SELL_SHARES"),
  ).length;
  const socialInteractions = episode.events.filter(
    (event) =>
      isActionEvent(event) &&
      ["LIKE_POST", "COMMENT_ON_POST", "FOLLOW_USER", "CREATE_POST"].includes(event.actionName),
  ).length;
  const actionErrors = episode.events.filter(
    (event) => isActionEvent(event) && typeof event.error === "string",
  ).length;
  const observations = episode.events.filter(isObservationEvent).length;
  const outcomes = episode.events.filter(isOutcomeEvent).length;

  const initialBalance = episode.metadata.initialWallet?.balance ?? null;
  const finalBalance = episode.finalWallet?.balance ?? null;
  const pnlDelta =
    initialBalance !== null && finalBalance !== null ? finalBalance - initialBalance : 0;

  const rewardsFromComponents =
    episode.reward?.components?.reduce((acc, component) => acc + component.value, 0) ?? 0;
  const totalReward = typeof episode.reward?.total === "number" ? episode.reward.total : rewardsFromComponents;

  return {
    episodeId: episode.metadata.episodeId,
    agentId: episode.metadata.agentId,
    characterName: episode.metadata.characterName,
    totalReward,
    durationSeconds,
    pnlDelta,
    totalTrades,
    socialInteractions,
    actionErrors,
    observations,
    outcomes,
    rewardComponents: episode.reward?.components ?? [],
  };
}

export function computeEnvironmentRewards(summary: EpisodeSummary): RewardComponent[] {
  const components: RewardComponent[] = [];

  components.push({
    name: "pnl_delta",
    value: summary.pnlDelta,
    metadata: { pnlDelta: summary.pnlDelta },
  });

  if (summary.totalTrades > 0) {
    const errorRatio = summary.actionErrors / summary.totalTrades;
    components.push({
      name: "trade_quality",
      value: -(errorRatio * summary.totalTrades),
      metadata: {
        actionErrors: summary.actionErrors,
        totalTrades: summary.totalTrades,
      },
    });
  }

  components.push({
    name: "social_engagement",
    value: summary.socialInteractions * 0.5,
    metadata: { socialInteractions: summary.socialInteractions },
  });

  // Encourage longer episodes up to a cap (5 minutes)
  const durationScore = Math.min(summary.durationSeconds / 60, 5);
  components.push({
    name: "duration_bonus",
    value: durationScore,
    metadata: { durationSeconds: summary.durationSeconds },
  });

  return components;
}

function formatEpisodeForJudge(summary: EpisodeSummary): string {
  return [
    `Episode: ${summary.episodeId}`,
    `Agent: ${summary.characterName}`,
    `P&L Delta: ${summary.pnlDelta.toFixed(2)}`,
    `Trades: ${summary.totalTrades} (errors: ${summary.actionErrors})`,
    `Social interactions: ${summary.socialInteractions}`,
    `Duration: ${summary.durationSeconds.toFixed(1)}s`,
    `Reward components: ${summary.rewardComponents
      .map((component) => `${component.name}=${component.value.toFixed(2)}`)
      .join(", ")}`,
  ].join("\n");
}

async function judgeEpisodeGroup(
  llm: BabylonLLMClient,
  group: EpisodeSummary[],
): Promise<RulerScore[]> {
  const prompt = `You are an evaluator scoring autonomous financial trading agents acting in a combined social + market simulation. For each episode summary below, assign a score between 0.0 and 1.0 based on:

- Profit and loss delta (higher is better, avoid reckless negative P&L)
- Smart trade execution (fewer errors, good volume)
- Healthy social engagement (likes/comments/follows when meaningful)
- Overall time spent productively (longer is fine if results justify)

Provide a JSON array where each element is { "episodeId": "<id>", "score": <0-1>, "reasoning": "<short explanation>" }.

Episodes:
${group.map(formatEpisodeForJudge).join("\n\n")}
`;

  const response = await llm.generateJSON<RulerScore[]>(prompt, {
    required: ["0"],
    properties: {},
  });

  return response;
}

export async function applyRulerScoring(
  episodes: EpisodeSummary[],
  groupSize: number = 4,
): Promise<Map<string, RulerScore>> {
  if (episodes.length === 0) {
    return new Map();
  }
  const llm = new BabylonLLMClient();
  const results = new Map<string, RulerScore>();

  for (let i = 0; i < episodes.length; i += groupSize) {
    const group = episodes.slice(i, i + groupSize);
    if (group.length === 0) continue;
    try {
      const scores = await judgeEpisodeGroup(llm, group);
      scores.forEach((score) => {
        results.set(score.episodeId, score);
      });
    } catch (error) {
      console.warn("RULER scoring failed for group", error);
    }
  }

  return results;
}

export async function computeRewards(
  episodes: EpisodeRecord[],
): Promise<RewardComputationResult[]> {
  const summaries = episodes.map(summarizeEpisode);
  const rulerScores = await applyRulerScoring(summaries);

  return summaries.map((summary) => {
    const envComponents = computeEnvironmentRewards(summary);
    const rulerScore = rulerScores.get(summary.episodeId);
    if (rulerScore) {
      envComponents.push({
        name: "ruler_score",
        value: rulerScore.score * 10,
        metadata: { reasoning: rulerScore.reasoning },
      });
    }

    return {
      summary,
      components: envComponents,
      rulerScore,
    };
  });
}


