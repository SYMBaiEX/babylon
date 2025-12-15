/**
 * Plugin Agent Core
 *
 * Core plugin for agent chat capabilities:
 * - TOGGLE_AUTONOMY action for enabling/disabling autonomous features
 * - CHECK_AUTONOMY action for viewing current autonomous feature status
 * - CHECK_PNL action for checking trading performance
 * - CHECK_RECENT_POSTS action for viewing recent posts
 * - CHECK_RECENT_COMMENTS action for viewing recent comments
 * - CHECK_MARKETS action for viewing current market data
 * - CHECK_ACTIVE_PREDICTIONS action for viewing active prediction questions
 * - CHECK_RECENT_MARKET_TRADES action for viewing recent trading activity
 * - CHECK_WORLD_ACTORS action for viewing world actors (parody names)
 * - CREATE_POST action for creating posts on the Babylon feed
 * - Providers for actions, recent messages, and action state
 *
 * @packageDocumentation
 */

import type { Plugin } from '@elizaos/core';
import { checkActivePredictionsAction } from './actions/check-active-predictions';
import { checkAutonomyAction } from './actions/check-autonomy';
import { checkMarketsAction } from './actions/check-markets';
import { checkPnlAction } from './actions/check-pnl';
import { checkRecentCommentsAction } from './actions/check-recent-comments';
import { checkRecentMarketTradesAction } from './actions/check-recent-market-trades';
import { checkRecentPostsAction } from './actions/check-recent-posts';
import { checkWorldActorsAction } from './actions/check-world-actors';
import { createPostAction } from './actions/create-post';
import { toggleAutonomyAction } from './actions/toggle-autonomy';
import {
  actionStateProvider,
  actionsProvider,
  recentMessagesProvider,
} from './providers';

/**
 * Agent Core Plugin
 */
export const agentCorePlugin: Plugin = {
  name: 'agent-core',
  description:
    'Core agent capabilities for multi-step chat with autonomy control, posting, and market insights',

  actions: [
    toggleAutonomyAction,
    checkAutonomyAction,
    checkPnlAction,
    checkRecentPostsAction,
    checkRecentCommentsAction,
    checkMarketsAction,
    checkActivePredictionsAction,
    checkRecentMarketTradesAction,
    checkWorldActorsAction,
    createPostAction,
  ],

  providers: [actionsProvider, recentMessagesProvider, actionStateProvider],
};

export * from './actions';
export * from './providers';
export * from './types';

export default agentCorePlugin;
