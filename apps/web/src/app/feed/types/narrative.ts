import type { ArcStateType } from '@babylon/db';

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

export interface NarrativeStory {
  storyKey: string;
  storyTitle: string;
  questionNumber: number | null;
  arcState: ArcStateType | null;
  storyScore: number;
  postCount: number;
  posts: NarrativePost[];
  hasUserPosition: boolean;
}
