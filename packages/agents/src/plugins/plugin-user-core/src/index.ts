/**
 * Plugin User Core
 *
 * Core plugin for the user coordinator in team chat.
 * Provides limited actions and context for helping users coordinate their agents.
 *
 * Key differences from plugin-agent-core:
 * - Limited action set (read-only, informational)
 * - No trading, posting, or agent-specific actions
 * - Coordinator context provider for guiding users
 * - All providers are coordinator-specific (not shared with agents)
 *
 * @packageDocumentation
 */

import type { Plugin } from '@elizaos/core';
import {
  checkFeedPostsAction,
  checkPerpsAction,
  checkPredictionsAction,
  checkRecentMarketTradesAction,
  checkTeamChatAction,
  checkUserPnlAction,
} from './actions';
import {
  coordinatorActionStateProvider,
  coordinatorActionsProvider,
  coordinatorContextProvider,
  coordinatorRecentMessagesProvider,
  coordinatorTeamMembersProvider,
} from './providers';

/**
 * User Core Plugin
 *
 * Provides capabilities for the user coordinator:
 * - CHECK_PREDICTIONS - Detailed prediction market info
 * - CHECK_PERPS - Perpetual market data
 * - CHECK_USER_PNL - User's balance, positions, P&L
 * - CHECK_TEAM_CHAT - Full team chat history
 * - CHECK_FEED_POSTS - Latest posts from global feed
 * - CHECK_RECENT_MARKET_TRADES - Platform trading activity
 * - Coordinator-specific providers for actions, messages, team members, and context
 */
export const userCorePlugin: Plugin = {
  name: 'user-core',
  description:
    'Core capabilities for user coordinator with read-only actions for team chat coordination',

  actions: [
    // Market information
    checkPredictionsAction,
    checkPerpsAction,
    // User portfolio
    checkUserPnlAction,
    // Team chat
    checkTeamChatAction,
    // Social & activity
    checkFeedPostsAction,
    checkRecentMarketTradesAction,
  ],

  providers: [
    // Coordinator-specific providers
    coordinatorActionsProvider,
    coordinatorRecentMessagesProvider,
    coordinatorActionStateProvider,
    coordinatorTeamMembersProvider,
    coordinatorContextProvider,
  ],
};

// Export individual components
export {
  checkFeedPostsAction,
  checkPerpsAction,
  checkPredictionsAction,
  checkRecentMarketTradesAction,
  checkTeamChatAction,
  checkUserPnlAction,
} from './actions';
export {
  coordinatorActionStateProvider,
  coordinatorActionsProvider,
  coordinatorContextProvider,
  coordinatorRecentMessagesProvider,
  coordinatorTeamMembersProvider,
} from './providers';
export * from './types';

export default userCorePlugin;
