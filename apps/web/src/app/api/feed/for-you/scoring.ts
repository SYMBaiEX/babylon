import type { NarrativeStory } from '@babylon/shared';

const AUTHOR_REPEAT_PENALTY = 0.55;
const CLUSTER_REPEAT_PENALTY = 0.8;
const MARKET_WINDOW_PENALTY = 0.5;
const MARKET_WINDOW_SIZE = 5;
const MAX_SCAN_AHEAD = 12;

export interface ForYouScoreInput {
  baseScore: number;
  topicMatchScore: number;
  socialAffinityScore: number;
  marketRelevanceScore: number;
  engagementVelocityScore: number;
  conversationDepthScore: number;
  narrativeUrgencyScore: number;
  freshnessScore: number;
  noveltyScore: number;
  retentionScore?: number;
  fatiguePenalty?: number;
  explorationBonus?: number;
}

export function calculateVelocityScore(
  engagementTotal: number,
  newest: Date
): number {
  const ageHours = Math.max(
    (Date.now() - newest.getTime()) / (1000 * 60 * 60),
    0
  );
  return Math.log1p(engagementTotal) / Math.sqrt(ageHours + 1);
}

export function calculateConversationDepthScore(
  commentCount: number,
  uniqueAuthors: number
): number {
  return Math.log1p(commentCount * 1.5 + uniqueAuthors);
}

export function calculateFreshnessScore(newest: Date): number {
  const ageHours = Math.max(
    (Date.now() - newest.getTime()) / (1000 * 60 * 60),
    0
  );
  return Math.exp((-Math.LN2 * ageHours) / 10);
}

export function calculateForYouScore(input: ForYouScoreInput): number {
  const normalizedBase = Math.log1p(Math.max(input.baseScore, 0));
  const retentionScore = input.retentionScore ?? 0;
  const fatiguePenalty = input.fatiguePenalty ?? 0;
  const explorationBonus = input.explorationBonus ?? 0;

  return (
    normalizedBase * 0.24 +
    input.topicMatchScore * 0.2 +
    input.socialAffinityScore * 0.14 +
    input.marketRelevanceScore * 0.16 +
    input.engagementVelocityScore * 0.1 +
    input.conversationDepthScore * 0.06 +
    input.narrativeUrgencyScore * 0.05 +
    input.freshnessScore * 0.03 +
    input.noveltyScore * 0.02 +
    retentionScore * 0.07 +
    explorationBonus * 0.03 -
    fatiguePenalty * 0.18
  );
}

function getPrimaryAuthorId(story: NarrativeStory): string | null {
  return story.primaryAuthorId ?? story.posts[0]?.authorId ?? null;
}

function getClusterId(story: NarrativeStory): string {
  return story.clusterId ?? story.storyKey;
}

export function diversifyForYouStories(
  rankedStories: NarrativeStory[]
): NarrativeStory[] {
  const remaining = [...rankedStories];
  const result: NarrativeStory[] = [];
  const recentAuthorIds: string[] = [];
  const recentClusterIds: string[] = [];
  let recentMarketCards = 0;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    const scanLimit = Math.min(remaining.length, MAX_SCAN_AHEAD);

    for (let index = 0; index < scanLimit; index++) {
      const story = remaining[index]!;
      let adjustedScore = story.finalRankScore ?? story.storyScore;
      const authorId = getPrimaryAuthorId(story);
      const clusterId = getClusterId(story);

      if (authorId && recentAuthorIds.includes(authorId)) {
        adjustedScore -= AUTHOR_REPEAT_PENALTY;
      }

      if (recentClusterIds.includes(clusterId)) {
        adjustedScore -= CLUSTER_REPEAT_PENALTY;
      }

      if (story.isNewMarket && recentMarketCards >= 1) {
        adjustedScore -= MARKET_WINDOW_PENALTY;
      }

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIndex = index;
      }
    }

    const [selected] = remaining.splice(bestIndex, 1);
    if (!selected) break;

    result.push(selected);

    const authorId = getPrimaryAuthorId(selected);
    if (authorId) {
      recentAuthorIds.unshift(authorId);
      if (recentAuthorIds.length > 3) recentAuthorIds.pop();
    }

    recentClusterIds.unshift(getClusterId(selected));
    if (recentClusterIds.length > 3) recentClusterIds.pop();

    recentMarketCards = result
      .slice(-MARKET_WINDOW_SIZE)
      .filter((story) => story.isNewMarket).length;
  }

  return result;
}
