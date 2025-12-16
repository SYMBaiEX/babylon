/**
 * Plugin Agent Core
 *
 * Core plugin for agent chat capabilities:
 * - TOGGLE_AUTONOMY action for enabling/disabling autonomous features
 * - CHECK_AUTONOMY action for viewing current autonomous feature status
 * - CHECK_PNL action for checking trading performance
 * - CHECK_RECENT_POSTS action for viewing recent posts
 * - CHECK_RECENT_COMMENTS action for viewing recent comments
 * - CHECK_PERPS action for viewing perpetual market data
 * - CHECK_PREDICTIONS action for viewing prediction markets (active/resolved)
 * - CHECK_RECENT_MARKET_TRADES action for viewing recent trading activity
 * - CHECK_WORLD_ACTORS action for viewing world actors (parody names)
 * - CREATE_POST action for creating posts on the Babylon feed
 * - BUY_PREDICTION action for buying prediction market shares
 * - SELL_PREDICTION action for selling prediction market shares
 * - OPEN_PERP action for opening perpetual positions
 * - CLOSE_PERP action for closing perpetual positions
 * - Providers for actions, recent messages, and action state
 *
 * @packageDocumentation
 */

import type { Plugin } from '@elizaos/core';
import { buyPredictionAction } from './actions/buy-prediction';
import { checkAutonomyAction } from './actions/check-autonomy';
import { checkPerpsAction } from './actions/check-perps';
import { checkPnlAction } from './actions/check-pnl';
import { checkPredictionsAction } from './actions/check-predictions';
import { checkRecentCommentsAction } from './actions/check-recent-comments';
import { checkRecentMarketTradesAction } from './actions/check-recent-market-trades';
import { checkRecentPostsAction } from './actions/check-recent-posts';
import { checkWorldActorsAction } from './actions/check-world-actors';
import { closePerpAction } from './actions/close-perp';
import { createPostAction } from './actions/create-post';
import { openPerpAction } from './actions/open-perp';
import { sellPredictionAction } from './actions/sell-prediction';
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
    'Core agent capabilities for multi-step chat with autonomy control, posting, trading, and market insights',

  actions: [
    // Autonomy management
    toggleAutonomyAction,
    checkAutonomyAction,
    // Info/check actions
    checkPnlAction,
    checkRecentPostsAction,
    checkRecentCommentsAction,
    checkPerpsAction,
    checkPredictionsAction,
    checkRecentMarketTradesAction,
    checkWorldActorsAction,
    // Social actions
    createPostAction,
    // Trading actions (require A2A)
    buyPredictionAction,
    sellPredictionAction,
    openPerpAction,
    closePerpAction,
  ],

  providers: [actionsProvider, recentMessagesProvider, actionStateProvider],
};

export * from './actions';
export * from './providers';
export * from './types';

export default agentCorePlugin;
