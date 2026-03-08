import { describe, expect, it } from 'bun:test';
import type { NarrativeStory } from '@babylon/shared';
import {
  calculateConversationDepthScore,
  calculateForYouScore,
  calculateFreshnessScore,
  calculateVelocityScore,
  diversifyForYouStories,
} from './scoring';

function makeStory(
  storyKey: string,
  overrides: Partial<NarrativeStory> = {}
): NarrativeStory {
  return {
    storyKey,
    storyTitle: storyKey,
    questionNumber: null,
    arcState: null,
    storyScore: 1,
    finalRankScore: 1,
    postCount: 1,
    posts: [
      {
        id: `${storyKey}-post`,
        content: storyKey,
        fullContent: null,
        articleTitle: null,
        category: null,
        imageUrl: null,
        type: 'post',
        timestamp: new Date().toISOString(),
        authorId: `${storyKey}-author`,
        authorName: storyKey,
        authorUsername: null,
        authorProfileImageUrl: null,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        isLiked: false,
        isShared: false,
        relatedQuestion: null,
      },
    ],
    hasUserPosition: false,
    ...overrides,
  };
}

describe('for-you scoring helpers', () => {
  it('rewards fresher items with higher freshness scores', () => {
    const now = calculateFreshnessScore(new Date());
    const yesterday = calculateFreshnessScore(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    expect(now).toBeGreaterThan(yesterday);
  });

  it('rewards engagement velocity for recent engaged content', () => {
    const recent = calculateVelocityScore(30, new Date());
    const stale = calculateVelocityScore(
      30,
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    expect(recent).toBeGreaterThan(stale);
  });

  it('rewards deeper conversation threads', () => {
    expect(calculateConversationDepthScore(12, 4)).toBeGreaterThan(
      calculateConversationDepthScore(1, 1)
    );
  });

  it('weights topic and market relevance in the final score', () => {
    const highIntent = calculateForYouScore({
      baseScore: 2,
      topicMatchScore: 1.75,
      socialAffinityScore: 1.2,
      marketRelevanceScore: 1.5,
      engagementVelocityScore: 1.1,
      conversationDepthScore: 0.9,
      narrativeUrgencyScore: 0.6,
      freshnessScore: 1,
      noveltyScore: 0.4,
    });
    const lowIntent = calculateForYouScore({
      baseScore: 2,
      topicMatchScore: 0,
      socialAffinityScore: 0.1,
      marketRelevanceScore: 0.1,
      engagementVelocityScore: 0.2,
      conversationDepthScore: 0.1,
      narrativeUrgencyScore: 0,
      freshnessScore: 0.4,
      noveltyScore: 0.1,
    });

    expect(highIntent).toBeGreaterThan(lowIntent);
  });

  it('diversifies repeated authors and clusters', () => {
    const stories = [
      makeStory('a1', {
        finalRankScore: 9,
        primaryAuthorId: 'same-author',
        clusterId: 'cluster-a',
      }),
      makeStory('a2', {
        finalRankScore: 8.5,
        primaryAuthorId: 'same-author',
        clusterId: 'cluster-a',
      }),
      makeStory('b1', {
        finalRankScore: 8,
        primaryAuthorId: 'other-author',
        clusterId: 'cluster-b',
      }),
    ];

    const diversified = diversifyForYouStories(stories);
    expect(diversified[0]?.storyKey).toBe('a1');
    expect(diversified[1]?.storyKey).toBe('b1');
  });
});
