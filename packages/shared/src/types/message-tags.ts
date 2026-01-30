/**
 * Message Tag Types
 *
 * Tags are attached to messages when actions are executed (e.g., CHECK_PERPS, CHECK_PREDICTIONS).
 * They appear as clickable buttons below the message content and open a sidebar panel with detailed data.
 */

/** Tag types that can appear on messages */
export type MessageTagType =
  | 'perps' // Perpetual markets list
  | 'predictions' // Prediction markets list
  | 'post' // Single post detail
  | 'feed' // Feed posts list
  | 'agent-pnl' // Agent's P&L (balance, positions, trades)
  | 'owner-pnl'; // Owner's P&L (user's portfolio)

/** Lucide icon names used for tags */
export type MessageTagIcon =
  | 'TrendingUp' // perps
  | 'Target' // predictions
  | 'FileText' // post
  | 'Newspaper' // feed
  | 'Wallet' // agent-pnl
  | 'PiggyBank'; // owner-pnl

/** Mapping from tag type to its specific data payload */
interface TagDataMap {
  perps: PerpsTagData;
  predictions: PredictionsTagData;
  post: PostTagData;
  feed: FeedTagData;
  'agent-pnl': PnlTagData;
  'owner-pnl': PnlTagData;
}

/** Base tag structure with common fields */
interface MessageTagBase<T extends MessageTagType> {
  /** Tag type - determines which sidebar panel to render */
  type: T;
  /** Display text shown on the tag button */
  label: string;
  /** Lucide icon name to display */
  icon: MessageTagIcon;
  /** Optional entity ID for deep-linking (e.g., specific market or post ID) */
  entityId?: string;
  /** Data payload for the sidebar panel - typed based on tag type */
  data: TagDataMap[T];
}

/** Tag attached to a message - discriminated union based on type */
export type MessageTag =
  | MessageTagBase<'perps'>
  | MessageTagBase<'predictions'>
  | MessageTagBase<'post'>
  | MessageTagBase<'feed'>
  | MessageTagBase<'agent-pnl'>
  | MessageTagBase<'owner-pnl'>;

/** Message metadata stored in DB */
export interface MessageMetadata {
  /** Action tags from executed actions */
  tags?: MessageTag[];
}

// =============================================================================
// Tag Data Types - Structured data for each tag type
// =============================================================================

/** Single perp market data */
export interface PerpMarketData {
  ticker: string;
  name: string | null;
  currentPrice: number;
  changePercent24h: number;
  volume24h: number;
  openInterest?: number;
  fundingRate?: number;
}

/** Data for perps tag - supports both list and single market views */
export interface PerpsTagData {
  /** List of markets (for list view) */
  markets?: PerpMarketData[];
  /** Single market details (for specific market view) */
  market?: PerpMarketData;
}

/** Single prediction market data */
export interface PredictionMarketData {
  id: string | number;
  question: string;
  yesPercent: number;
  noPercent: number;
  resolved: boolean;
  resolution: string | null;
  daysUntil: number | null;
  endDate: string;
  index?: number;
  yesShares?: number;
  noShares?: number;
}

/** Data for predictions tag - supports both list and single market views */
export interface PredictionsTagData {
  /** List of predictions (for list view) */
  predictions?: PredictionMarketData[];
  /** Single prediction details (for specific market view) */
  prediction?: PredictionMarketData;
  /** Status filter used (only for list view) */
  status?: 'active' | 'resolved' | 'all';
}

/** Data for post tag */
export interface PostTagData {
  post: {
    id: string;
    content: string;
    author: string;
    authorId: string;
    authorProfileImageUrl?: string | null;
    /** ISO 8601 date string (serialized as string in JSON) */
    createdAt: string;
  };
  commentCount: number;
  shareCount?: number;
}

/** Data for feed tag */
export interface FeedTagData {
  posts: Array<{
    index: number;
    id: string;
    content: string;
    authorName: string;
    authorId: string;
    authorProfileImageUrl?: string | null;
    timeAgo: string;
    likeCount: number;
    commentCount: number;
    shareCount: number;
  }>;
  count: number;
  hasMore: boolean;
}

/** Data for P&L tags (agent-pnl and owner-pnl) */
export interface PnlTagData {
  ownerName?: string; // Only for owner-pnl
  balance: number;
  lifetimePnL: number;
  predictionPositions: Array<{
    id: string;
    marketId: string | null;
    side: string;
    shares: number;
    avgPrice?: number;
    question?: string;
  }>;
  perpPositions: Array<{
    id: string;
    ticker: string;
    side: string;
    size: number;
    entryPrice?: number;
    leverage?: number;
  }>;
  recentTrades?: Array<{
    action: string;
    ticker: string;
    amount: number;
    pnl: number | null;
  }>;
}
