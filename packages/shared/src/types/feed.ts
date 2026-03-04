/**
 * Narrative Feed Types
 *
 * Single source of truth for narrative feed API response shapes.
 * Consumed by both the API route (apps/web/src/app/api/feed/narrative/route.ts)
 * and frontend feed components.
 *
 * ArcStateType mirrors the union defined in @babylon/db/src/schema/narrative.ts.
 * The db schema definition is the canonical one; keep this copy in sync with it.
 */

/**
 * Arc state for a prediction market question.
 * Covers all market durations (long-term, weekly, daily, intraday, flash).
 */
export type ArcStateType =
  | 'setup'
  | 'tension'
  | 'escalation'
  | 'crisis'
  | 'revelation'
  | 'resolution'
  | 'resolving'
  | 'active'
  | 'climax'
  | 'live'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening';

/**
 * A single post within a narrative story group.
 * Matches the shape returned by GET /api/feed/narrative.
 */
export interface NarrativePost {
  id: string;
  content: string;
  fullContent: string | null;
  articleTitle: string | null;
  category: string | null;
  imageUrl: string | null;
  type: string | null;
  timestamp: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorProfileImageUrl: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isShared: boolean;
  relatedQuestion: number | null;
}

/**
 * A narrative story — posts grouped by prediction market question,
 * scored by the narrative engine (engagement × arc state × resolution proximity).
 * Matches the shape returned by GET /api/feed/narrative.
 *
 * When `isNewMarket` is true the story represents a freshly opened prediction
 * market question (no or very few posts yet). The feed renders a dedicated
 * NewMarketCard with a "Trade" CTA instead of the normal story layout.
 */
export interface NarrativeStory {
  storyKey: string;
  storyTitle: string;
  questionNumber: number | null;
  arcState: ArcStateType | null;
  storyScore: number;
  postCount: number;
  posts: NarrativePost[];
  hasUserPosition: boolean;
  /** True when this entry is a newly-opened market (< 24h), not a post group */
  isNewMarket?: boolean;
  /** ISO-8601 resolution deadline, present when isNewMarket is true */
  resolutionDate?: string;
}
